/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Module4Output,
  ScenarioResult,
  InterventionLevers,
  ProjectionTrajectory,
  GridNode,
  SEIRCompartment,
  ABCSMCParameter,
  ScenarioId,
} from "@/types"

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function rng(seed: number | undefined) {
  let s = seed ?? Date.now()
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function sampleUniform(min: number, max: number, random: () => number): number {
  return min + random() * (max - min)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Dispersal weight at distance d (km) for scale alpha, kernel type. */
function dispersalWeight(d: number, alpha: number, kernel: string): number {
  if (d <= 0) return 1
  if (kernel === "exponential") return Math.exp(-d / alpha)
  if (kernel === "power_law") return (1 + d / alpha) ** -1.5
  return Math.exp(-Math.sqrt(d / alpha))
}

/** Levers-adjusted per-node effective transmission multiplier. */
function leverMultiplier(
  levers: InterventionLevers,
  node: NodeState,
  monthIndex: number,
  vectorControlApplied: boolean,
): number {
  let mult = 1
  // Roguing reduces infectious pool (compliance) but delayed
  if (monthIndex * 30 >= levers.roguingResponseDelayDays) {
    mult *= 1 - levers.roguingComplianceRate * 0.8
  }
  // Clean planting material reduces new susceptible -> exposed conversion
  mult *= 1 - levers.cleanPlantingAdoptionRate * 0.5
  // Movement restrictions reduce long-range jump dispersal
  if (levers.movementRestriction) mult *= 0.6
  // Vector control reduces transmission after timing
  if (vectorControlApplied) mult *= 1 - levers.vectorControlEfficacy * 0.7
  return clamp01(mult)
}

/** Build default intervention levers. */
export const DEFAULT_LEVERS: InterventionLevers = {
  surveillanceFrequency: 2,
  bufferRadiusKm: 5,
  roguingComplianceRate: 0.6,
  roguingResponseDelayDays: 30,
  cleanPlantingAdoptionRate: 0.4,
  movementRestriction: false,
  vectorControlEfficacy: 0.5,
  vectorControlTimingDays: 60,
}

interface SimParams {
  beta: number
  alpha: number
  sigmaInv: number
  vectorEfficiency: number
  kernel: string
}

interface NodeState {
  id: string
  lat: number
  lon: number
  S: number
  E: number
  I: number
  R: number
  hostDensity: number
}

function initNodeState(n: GridNode): NodeState {
  const total = 100
  const i0 = Math.max(1, Math.round(total * Math.max(n.prevalence, 0.01)))
  return {
    id: n.id,
    lat: n.lat,
    lon: n.lon,
    S: total - i0,
    E: 0,
    I: i0,
    R: 0,
    hostDensity: n.hostDensity,
  }
}

function stepNode(
  nodes: NodeState[],
  params: SimParams,
  levers: InterventionLevers,
  monthIndex: number,
  random: () => number,
): NodeState[] {
  const { beta, alpha, sigmaInv, vectorEfficiency, kernel } = params
  const sigma = 1 / Math.max(sigmaInv, 0.1)
  const gamma = 1 / 7 // recovery per week ~ per month scale
  const n = nodes.length

  // Precompute total I and host density weights
  const I = nodes.map((x) => x.I)
  const pop = nodes.map((x) => x.S + x.E + x.I + x.R)

  // Vector control timing: applied after timingDays
  const vectorControlApplied = monthIndex * 30 >= levers.vectorControlTimingDays

  const next = nodes.map((node) => ({ ...node }))

  for (let i = 0; i < n; i++) {
    const node = next[i]
    const Ni = Math.max(pop[i], 1)
    const lamWithin = beta * (node.I / Ni) * vectorEfficiency

    // Between-node dispersal force of infection
    let lamBetween = 0
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const d = haversineKm(node.lat, node.lon, nodes[j].lat, nodes[j].lon)
      const w = dispersalWeight(d, alpha, kernel)
      // Movement restrictions reduce long-range (> buffer) jumps
      let rangePenalty = 1
      if (levers.movementRestriction && d > levers.bufferRadiusKm) rangePenalty = 0.3
      lamBetween +=
        beta *
        (I[j] / Math.max(pop[j], 1)) *
        w *
        vectorEfficiency *
        rangePenalty *
        0.05
    }

    const leverMult = leverMultiplier(levers, nodes[i], monthIndex, vectorControlApplied)
    const lambda = (lamWithin + lamBetween) * leverMult * node.hostDensity

    const pE = 1 - Math.exp(-Math.max(lambda, 0))
    const newE = Math.min(Math.floor(node.S * pE + (random() < pE ? 1 : 0)), node.S)

    const pI = 1 - Math.exp(-sigma)
    const newI = Math.min(Math.floor(node.E * pI + (random() < pE ? 1 : 0)), node.E)

    const pR = 1 - Math.exp(-gamma)
    const newR = Math.min(Math.floor(node.I * pR + (random() < pR ? 1 : 0)), node.I)

    node.S -= newE
    node.E = node.E + newE - newI
    node.I = node.I + newI - newR
    node.R += newR
  }

  return next
}

function simulateScenario(
  template: GridNode[],
  params: SimParams,
  levers: InterventionLevers,
  months: number,
  seed: number,
  random: () => number,
): { trajectories: ProjectionTrajectory[]; snapshots: Array<{ timeStep: number; prevalence: number[] }> } {
  const nodes = template.map(initNodeState)
  const trajectories: ProjectionTrajectory[] = []
  const snapshots: Array<{ timeStep: number; prevalence: number[] }> = []

  let cur = nodes
  for (let t = 0; t <= months; t++) {
    const totalPop = cur.reduce((s, x) => s + x.S + x.E + x.I + x.R, 0)
    const totalI = cur.reduce((s, x) => s + x.I, 0)
    const prevalence = cur.map((x) => x.I / Math.max(x.S + x.E + x.I + x.R, 1))
    const sortedPrev = [...prevalence].sort((a, b) => a - b)

    trajectories.push({
      timeStep: t,
      meanPrevalence: totalI / Math.max(totalPop, 1),
      ciLower: percentile(sortedPrev, 5),
      ciUpper: percentile(sortedPrev, 95),
      totalInfected: Math.round(totalI),
      newlyInfected: t === 0 ? 0 : Math.max(0, totalI - trajectories[t - 1].totalInfected),
    })
    snapshots.push({ timeStep: t, prevalence })

    if (t < months) {
      cur = stepNode(cur, params, levers, t, random)
    }
  }

  return { trajectories, snapshots }
}

/**
 * Module 4: Future Spread Forecasting & Intervention Scenarios.
 *
 * Forward stochastic ensemble projections sampled from ABC-SMC posterior
 * particles, comparing Card 4 (No Control / Baseline) vs Card 5
 * (Management Interventions). Produces synchronized spatial spread heatmaps
 * and multi-trajectory fan charts over T months.
 */
export interface Module4Options {
  gridNodes: GridNode[]
  posteriorParameters: ABCSMCParameter[] // from Module 3
  months: number
  ensembleSize: number
  seed?: number
  noControlLevers?: Partial<InterventionLevers>
  managementLevers?: Partial<InterventionLevers>
}

export function runModule4Forecast(opts: Module4Options): Module4Output {
  const {
    gridNodes,
    posteriorParameters = [],
    months = 24,
    ensembleSize = 30,
    seed,
    noControlLevers = {},
    managementLevers = {},
  } = opts

  const random = rng(seed)
  const nodeBounds: [[number, number], [number, number]] = [
    [
      Math.min(...gridNodes.map((n) => n.lat)),
      Math.min(...gridNodes.map((n) => n.lon)),
    ],
    [
      Math.max(...gridNodes.map((n) => n.lat)),
      Math.max(...gridNodes.map((n) => n.lon)),
    ],
  ]

  // Draw parameter samples from posterior particles (or prior fallback)
  const drawParams = (): SimParams => {
    const j = Math.floor(random() * Math.max(posteriorParameters.length, 1))
    const p = posteriorParameters[j] ?? posteriorParameters[0]
    return {
      beta: p ? p.posteriorMedian : 0.1,
      alpha: p ? (posteriorParameters[1]?.posteriorMedian ?? 20) : 20,
      sigmaInv: p ? (posteriorParameters[2]?.posteriorMedian ?? 7) : 7,
      vectorEfficiency: p ? (posteriorParameters[3]?.posteriorMedian ?? 1) : 1,
      kernel: "exponential",
    }
  }

  const noControl: InterventionLevers = { ...DEFAULT_LEVERS, ...noControlLevers }
  const management: InterventionLevers = { ...DEFAULT_LEVERS, ...managementLevers }

  const runScenario = (
    id: ScenarioId,
    name: string,
    color: string,
    levers: InterventionLevers,
  ): ScenarioResult => {
    const allTrajectories: ProjectionTrajectory[][] = []
    const allSnapshots: Array<Array<{ timeStep: number; prevalence: number[] }>> = []

    for (let e = 0; e < ensembleSize; e++) {
      const params = drawParams()
      const { trajectories, snapshots } = simulateScenario(
        gridNodes,
        params,
        levers,
        months,
        seed ?? 0,
        random,
      )
      allTrajectories.push(trajectories)
      allSnapshots.push(snapshots.map((s) => ({ timeStep: s.timeStep, prevalence: s.prevalence })))
    }

    // Ensemble mean trajectory + CI
    const nSteps = months + 1
    const trajectories: ProjectionTrajectory[] = []
    for (let t = 0; t < nSteps; t++) {
      const means = allTrajectories.map((tr) => tr[t].meanPrevalence).sort((a, b) => a - b)
      const lowers = allTrajectories.map((tr) => tr[t].ciLower)
      const uppers = allTrajectories.map((tr) => tr[t].ciUpper)
      const totalInfected = Math.round(
        allTrajectories.reduce((s, tr) => s + tr[t].totalInfected, 0) / ensembleSize,
      )
      trajectories.push({
        timeStep: t,
        meanPrevalence: percentile(means, 50),
        ciLower: percentile(lowers, 50),
        ciUpper: percentile(uppers, 95),
        totalInfected,
        newlyInfected: t === 0 ? 0 : totalInfected - (trajectories[t - 1]?.totalInfected ?? 0),
      })
    }

    // Aggregate snapshots: ensemble mean prevalence per node per time step
    const snapshots: Array<{ timeStep: number; prevalence: number[] }> = []
    for (let t = 0; t < nSteps; t++) {
      const nodePrev: number[] = new Array(gridNodes.length).fill(0)
      for (let e = 0; e < ensembleSize; e++) {
        const snap = allSnapshots[e][t]
        for (let i = 0; i < gridNodes.length; i++) {
          nodePrev[i] += snap.prevalence[i] / ensembleSize
        }
      }
      snapshots.push({ timeStep: t, prevalence: nodePrev })
    }

    const finalPrevalence = trajectories[nSteps - 1].meanPrevalence
    return { id, name, color, levers, trajectories, finalPrevalence, totalCasesAvertedVsBaseline: 0, gridSnapshots: snapshots }
  }

  const baseline = runScenario("no_control", "No intervention scenario", "#ef4444", noControl)
  const controlled = runScenario("management_interventions", "Management interventions", "#7c3aed", management)

  const totalCasesAvertedVsBaseline =
    baseline.trajectories[baseline.trajectories.length - 1].totalInfected -
    controlled.trajectories[controlled.trajectories.length - 1].totalInfected
  controlled.totalCasesAvertedVsBaseline = Math.max(0, totalCasesAvertedVsBaseline)

  return {
    scenarios: [baseline, controlled],
    timeHorizonMonths: months,
    nodeCount: gridNodes.length,
    bounds: nodeBounds,
    defaultLevers: DEFAULT_LEVERS,
  }
}
