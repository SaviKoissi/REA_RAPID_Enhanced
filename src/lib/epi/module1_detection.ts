/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  HostCluster,
  DetectionAlertLevel,
  DetectionMetrics,
  Module1MapLayers,
  Module1Output,
  SurveyPoint,
  HostCrop,
} from "@/types"

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Haversine great-circle distance in km between two lat/lon points. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)
}

export interface Module1Options {
  points: SurveyPoint[]
  hostClusters?: HostCluster[]
  hostRasterUrl?: string
  adminBoundsUrl?: string
  alertThresholds?: {
    watch: number // min positives
    alert: number
    critical: number
    maxDistanceKm: number // within this distance of a host cluster => escalate
  }
}

const DEFAULT_THRESHOLDS = {
  watch: 1,
  alert: 3,
  critical: 5,
  maxDistanceKm: 25,
}

/**
 * Module 1: Initial Detection & Situational Awareness.
 *
 * Trigger: ingestion of confirmed positive field reports / lab diagnostics.
 * Outputs: index case, detection velocity, distance to nearest host cluster,
 * alert level, and map-ready layers (positive/negative points, host clusters,
 * admin boundaries, host density raster reference).
 */
export function runModule1Detection(opts: Module1Options): Module1Output {
  const {
    points,
    hostClusters = [],
    hostRasterUrl,
    adminBoundsUrl,
    alertThresholds = DEFAULT_THRESHOLDS,
  } = opts

  const positive = points.filter((p) => p.positive)
  const negative = points.filter((p) => !p.positive)

  // Index case = earliest confirmed positive.
  const datedPositives = positive
    .map((p) => ({ point: p, date: parseDate(p.date) }))
    .filter((e): e is { point: SurveyPoint; date: Date } => e.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const indexCase = datedPositives.length > 0 ? datedPositives[0].point : null

  // Detection velocity = positives per day since index case (min 1 day).
  let detectionVelocity = 0
  let daysSinceIndex = 0
  if (indexCase && datedPositives.length > 0) {
    const indexDate = datedPositives[0].date
    const latestDate =
      datedPositives[datedPositives.length - 1].date
    daysSinceIndex = Math.max(1, Math.ceil(daysBetween(indexDate, latestDate)))
    detectionVelocity = positive.length / daysSinceIndex
  }

  // Nearest host cluster to the index case.
  let nearestHostCluster: HostCluster | null = null
  let distanceToNearestHostClusterKm = Infinity
  if (indexCase && hostClusters.length > 0) {
    for (const cluster of hostClusters) {
      const d = haversineKm(indexCase.lat, indexCase.lon, cluster.centroid[0], cluster.centroid[1])
      if (d < distanceToNearestHostClusterKm) {
        distanceToNearestHostClusterKm = d
        nearestHostCluster = cluster
      }
    }
  }
  if (distanceToNearestHostClusterKm === Infinity) {
    distanceToNearestHostClusterKm = -1
  }

  // Alert level.
  let alertLevel: DetectionAlertLevel = "none"
  if (positive.length >= alertThresholds.critical) {
    alertLevel = "critical"
  } else if (
    positive.length >= alertThresholds.alert ||
    (nearestHostCluster !== null &&
      distanceToNearestHostClusterKm >= 0 &&
      distanceToNearestHostClusterKm <= alertThresholds.maxDistanceKm &&
      positive.length >= alertThresholds.watch)
  ) {
    alertLevel = "alert"
  } else if (positive.length >= alertThresholds.watch) {
    alertLevel = "watch"
  }

  const metrics: DetectionMetrics = {
    indexCase,
    totalPoints: points.length,
    positiveCount: positive.length,
    negativeCount: negative.length,
    detectionVelocity: Math.round(detectionVelocity * 100) / 100,
    daysSinceIndex,
    distanceToNearestHostClusterKm:
      distanceToNearestHostClusterKm === -1 ? -1 : Math.round(distanceToNearestHostClusterKm * 100) / 100,
    nearestHostCluster,
    alertLevel,
    clusterCentroids: hostClusters,
  }

  const mapLayers: Module1MapLayers = {
    positiveMarkers: positive.map((p) => ({
      position: [p.lat, p.lon],
      label: `${p.sampleId} · POSITIVE · ${p.hostCrop}`,
    })),
    negativeMarkers: negative.map((p) => ({
      position: [p.lat, p.lon],
      label: `${p.sampleId} · NEGATIVE · ${p.hostCrop}`,
    })),
    hostClusters,
    adminBoundsUrl,
    hostRasterUrl,
  }

  return { metrics, mapLayers }
}

export function alertLevelColor(level: DetectionAlertLevel): string {
  switch (level) {
    case "none":
      return "text-muted-foreground"
    case "watch":
      return "text-yellow-700 dark:text-yellow-400"
    case "alert":
      return "text-orange-700 dark:text-orange-400"
    case "critical":
      return "text-destructive dark:text-destructive"
    default:
      return "text-muted-foreground"
  }
}

export function alertLevelBadge(level: DetectionAlertLevel): string {
  switch (level) {
    case "none":
      return "bg-secondary text-secondary-foreground"
    case "watch":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
    case "alert":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800"
    case "critical":
      return "bg-destructive text-destructive-foreground"
    default:
      return "bg-secondary text-secondary-foreground"
  }
}

export function deriveHostClustersFromPoints(
  points: SurveyPoint[],
  gridSizeKm: number = 50,
): HostCluster[] {
  // Simple grid binning of positive points to approximate host clusters.
  const bins = new Map<string, SurveyPoint[]>()
  for (const p of points) {
    if (!p.positive) continue
    const cellLat = Math.floor(p.lat / gridSizeKm) * gridSizeKm
    const cellLon = Math.floor(p.lon / gridSizeKm) * gridSizeKm
    const key = `${cellLat},${cellLon}`
    const arr = bins.get(key) ?? []
    arr.push(p)
    bins.set(key, arr)
  }

  const clusters: HostCluster[] = []
  let i = 0
  for (const [key, pts] of bins.entries()) {
    const [latStr, lonStr] = key.split(",")
    const lat = Number(latStr)
    const lon = Number(lonStr)
    let sumLat = 0
    let sumLon = 0
    for (const p of pts) {
      sumLat += p.lat
      sumLon += p.lon
    }
    clusters.push({
      id: `cluster_${i++}`,
      centroid: [sumLat / pts.length, sumLon / pts.length],
      hostDensity: pts.length,
      areaHa: gridSizeKm * gridSizeKm * 100, // approx ha
      name: `Host cluster ${i}`,
    })
  }
  return clusters
}
