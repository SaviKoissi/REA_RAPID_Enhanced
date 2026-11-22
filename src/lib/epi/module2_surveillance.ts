/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  SurveillanceConstraints,
  GridCell,
  Module2Output,
  FieldRecord,
  HostCrop,
} from "@/types"

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/**
 * Module 2: Optimal Delimitation Surveillance Design.
 *
 * Mathematical basis: spatial sampling optimization for disease surveillance of
 * clonally propagated crops under resource constraints (PLOS ONE
 * 10.1371/journal.pone.0304656).
 *
 * Given a field budget N_max, grid resolution, travel-cost weighting, and
 * diagnostic sensitivity/specificity, the engine:
 *   1. Tiles the region into grid cells annotated with host density and
 *      distance to the nearest confirmed positive.
 *   2. Scores each unsampled cell by detection probability (host density x
 *      proximity-to-outbreak x Se) penalized by travel cost.
 *   3. Greedily selects up to N_max cells maximizing total detection
 *      probability subject to the travel-cost budget.
 *   4. Emits a priority heatmap plus GeoJSON/CSV export of optimal coordinates.
 */
export interface Module2Options {
  bounds: [[number, number], [number, number]] // [[west, south], [east, north]]
  positivePoints: Array<{ lat: number; lon: number }>
  sampledPoints: Array<{ lat: number; lon: number }>
  hostDensityRaster?: Array<{ lat: number; lon: number; value: number }>
  constraints: Partial<SurveillanceConstraints>
}

const DEFAULT_CONSTRAINTS: SurveillanceConstraints = {
  maxSamples: 40,
  gridResolutionKm: 10,
  travelCostWeight: 0.3,
  sensitivity: 0.9,
  specificity: 0.95,
}

function interpolateHostDensity(
  lat: number,
  lon: number,
  raster: Module2Options["hostDensityRaster"],
): number {
  if (!raster || raster.length === 0) return 0.5 // uniform prior
  let best: { d: number; v: number } | null = null
  for (const cell of raster) {
    const d = haversineKm(lat, lon, cell.lat, cell.lon)
    if (best === null || d < best.d) best = { d, v: cell.value }
  }
  // inverse-distance weight the nearest few cells
  const k = 3
  const near = raster
    .map((c) => ({ d: haversineKm(lat, lon, c.lat, c.lon), v: c.value }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
  let wsum = 0
  let vsum = 0
  for (const n of near) {
    const w = 1 / (n.d + 1e-3)
    wsum += w
    vsum += n.v * w
  }
  return wsum > 0 ? vsum / wsum : 0.5
}

function cellId(lat: number, lon: number): string {
  return `cell_${lat.toFixed(4)}_${lon.toFixed(4)}`
}

export function runModule2Surveillance(opts: Module2Options): Module2Output {
  const {
    bounds,
    positivePoints = [],
    sampledPoints = [],
    hostDensityRaster,
    constraints = {},
  } = opts
  const c: SurveillanceConstraints = { ...DEFAULT_CONSTRAINTS, ...constraints }
  const [[west, south], [east, north]] = bounds

  // Resolve grid resolution in degrees (approx: 1 deg lat ~ 111 km)
  const degPerKm = 1 / 111
  const resDeg = (c.gridResolutionKm / 111) * degPerKm

  // Build grid
  const grid: GridCell[] = []
  let id = 0
  for (let lat = south; lat <= north + 1e-9; lat += resDeg) {
    for (let lon = west; lon <= east + 1e-9; lon += resDeg) {
      const hostDensity = interpolateHostDensity(lat, lon, hostDensityRaster)
      const dToPositive =
        positivePoints.length > 0
          ? Math.min(...positivePoints.map((p) => haversineKm(lat, lon, p.lat, p.lon)))
          : 50
      const alreadySampled = sampledPoints.some(
        (s) => haversineKm(lat, lon, s.lat, s.lon) < c.gridResolutionKm / 2,
      )
      const latRounded = Math.round(lat * 1e4) / 1e4
      const lonRounded = Math.round(lon * 1e4) / 1e4
      grid.push({
        id: cellId(latRounded, lonRounded),
        lat: latRounded,
        lon: lonRounded,
        hostDensity,
        distanceToNearestPositiveKm: Math.round(dToPositive * 100) / 100,
        alreadySampled,
        detectionProbability: 0,
        priorityScore: 0,
        selected: false,
        travelCost: 0,
      })
      id++
    }
  }

  // Detection probability per cell: host density x proximity x sensitivity
  // Proximity decays exponentially with distance to nearest positive (delimitation
  // focuses on the outbreak edge).
  for (const cell of grid) {
    const proximity = Math.exp(-cell.distanceToNearestPositiveKm / (c.gridResolutionKm * 2))
    const seTerm = c.sensitivity
    const spTerm = 1 - c.specificity
    // P(detect | infected present) ≈ Se * hostDensity * proximity
    cell.detectionProbability = Math.min(1, seTerm * cell.hostDensity * proximity)
  }

  // Travel cost from region centroid (proxy for base station)
  const centroidLat = (south + north) / 2
  const centroidLon = (west + east) / 2
  for (const cell of grid) {
    cell.travelCost = haversineKm(centroidLat, centroidLon, cell.lat, cell.lon)
  }

  // Greedy selection: maximize total detection prob subject to travel budget.
  // Budget expressed as max total travel cost (proxy) derived from N_max.
  const unsampled = grid.filter((c) => !c.alreadySampled)
  // Priority score = detection prob - travelCostWeight * normalized travel cost
  const maxTravel = Math.max(...unsampled.map((c) => c.travelCost), 1)
  for (const cell of unsampled) {
    const normTravel = cell.travelCost / maxTravel
    cell.priorityScore =
      cell.detectionProbability * (1 - c.travelCostWeight) - normTravel * c.travelCostWeight
  }

  // Select top N_max by priority score (only positive expected value)
  const ranked = unsampled
    .filter((c) => c.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
  const selected = ranked.slice(0, c.maxSamples)
  for (const cell of selected) cell.selected = true

  const totalDetectionProbability = selected.reduce((s, cell) => s + cell.detectionProbability, 0)
  const expectedDetections = selected.reduce(
    (s, cell) => s + cell.detectionProbability * c.sensitivity,
    0,
  )

  // GeoJSON export
  const features = selected.map((c) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [c.lon, c.lat],
    },
    properties: {
      id: c.id,
      priorityScore: Math.round(c.priorityScore * 1000) / 1000,
      detectionProbability: Math.round(c.detectionProbability * 1000) / 1000,
      hostDensity: Math.round(c.hostDensity * 1000) / 1000,
      distanceToNearestPositiveKm: c.distanceToNearestPositiveKm,
      travelCostKm: Math.round(c.travelCost * 100) / 100,
    },
  }))
  const geoJson = JSON.stringify(
    {
      type: "FeatureCollection" as const,
      features,
    },
    null,
    2,
  )

  const csvLines = [
    "id,lat,lon,priority_score,detection_probability,host_density,distance_to_nearest_positive_km,travel_cost_km",
  ]
  for (const c of selected) {
    csvLines.push(
      `${c.id},${c.lat},${c.lon},${c.priorityScore.toFixed(4)},${c.detectionProbability.toFixed(4)},${c.hostDensity.toFixed(4)},${c.distanceToNearestPositiveKm},${c.travelCost.toFixed(2)}`,
    )
  }
  const csv = csvLines.join("\n")

  return {
    grid,
    selectedCells: selected,
    totalDetectionProbability: Math.round(totalDetectionProbability * 100) / 100,
    expectedDetections: Math.round(expectedDetections * 100) / 100,
    constraints: c,
    exportGeoJson: geoJson,
    exportCsv: csv,
  }
}

/** Build a Module2Options payload from observatory field records. */
export function module2OptionsFromRecords(
  records: FieldRecord[],
  bounds: [[number, number], [number, number]],
  constraints: Partial<SurveillanceConstraints>,
): Module2Options {
  const positivePoints = records
    .filter((r) => r.diagnostic_status === "Infectious" || r.diagnostic_status === "Exposed")
    .map((r) => ({ lat: r.latitude, lon: r.longitude }))
  const sampledPoints = records.map((r) => ({ lat: r.latitude, lon: r.longitude }))
  const hostDensityRaster = records.map((r) => ({
    lat: r.latitude,
    lon: r.longitude,
    value: r.host_crop === "cassava" || r.host_crop === "banana" ? 0.8 : 0.4,
  }))
  return { bounds, positivePoints, sampledPoints, hostDensityRaster, constraints }
}
