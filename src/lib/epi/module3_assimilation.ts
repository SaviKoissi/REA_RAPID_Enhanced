/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Module3Output,
  ABCSMCParameter,
  ABCSMCToleranceSchedule,
  GridNode,
  SEIRCompartment,
  DispersalKernel,
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

function normalApprox(mean: number, sd: number, random: () => number): number {
  // Box-Muller
  let u = 0,
    v = 0
  while (u === 0) u = random()
  while (v === 0) v = random()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return mean + z * sd
}

/** Dispersal kernel weight at distance d (km) given scale alpha. */
function dispersalWeight(d: number, alpha: number, kernel: DispersalKernel): number {
  if (d <= 0) return 1
  if (kernel === "exponential") return Math.exp(-d / alpha)
  if (kernel === "power_law") return (1 + d / alpha) ** -1.5
  // levy: heavy-tailed approximation
  return Math.exp(-Math.sqrt(d / alpha))
}

/**
 * Spatial SEIR Individual-Based Model.
 * Each grid node carries S/E/I/R counts. Transmission occurs within-node
 * (frequency-dependent) and between nodes via the dispersal kernel.
 */
interface SEIRState {
  nodes: GridNode[]
  params: {
    beta: number // primary transmission rate
    alpha: number // dispersal kernel scale (km)
    sigmaInv: number // latent period (1/sigma = days exposed)
    vectorEfficiency: number // vector transmission multiplier
    kernel: DispersalKernel
  }
}

function makeSEIRState(
  nodes: GridNode[],
  params: SEIRState["params"],
  random: () => number,
): SEIRState {
  return { nodes: nodes.map((n) => ({ ...n, seir: { S: 100, E: 0, I: 0, R: 0 } })), params }
}

function seedInfection(state: SEIRState, nodeIdx: number, random: () => number) {
  const n = state.nodes[nodeIdx]
  if (n.seir.S > 0) {
    n.seir.S -= 1
    n.seir.E += 1
  }
}

function stepSEIR(state: SEIRState, random: () => number): SEIRState {
  const { beta, alpha, sigmaInv, vectorEfficiency, kernel } = state.params
  const nodes = state.nodes
  const nNodes = nodes.length

  // Precompute total I per node and pairwise weights
  const I = nodes.map((n) => n.seir.I)
  const totalPop = nodes.reduce((s, n) => s + n.seir.S + n.seir.E + n.seir.I + n.seir.R, 0)

  const next = nodes.map((n) => ({ ...n, seir: { ...n.seir } }))

  // Latent -> Infectious progression: E -> I at rate sigma = 1/sigmaInv per day
  const sigma = 1 / Math.max(sigmaInv, 0.1)

  for (let i = 0; i < nNodes; i++) {
    const ni = next[i]
    const Si = ni.seir.S
    const Ei = ni.seir.E
    const Ii = ni.seir.I
    const Ri = ni.seir.R
    const Ni = Si + Ei + Ii + Ri

    // Force of infection within node i (frequency-dependent)
    let lambda = beta * (Ii / Math.max(Ni, 1)) * vectorEfficiency

    // Add between-node dispersal force of infection
    for (let j = 0; j < nNodes; j++) {
      if (i === j) continue
      const d = haversineKm(ni.lat, ni.lon, nodes[j].lat, nodes[j].lon)
      const w = dispersalWeight(d, alpha, kernel)
      lambda += beta * (I[j] / Math.max(nodes[j].seir.S + nodes[j].seir.E + nodes[j].seir.I + nodes[j].seir.R, 1)) * w * vectorEfficiency * 0.05
    }

    // New exposures: S -> E ~ Binomial(S, 1 - exp(-lambda))
    const pE = 1 - Math.exp(-lambda)
    const newE = Math.floor(Si * pE + (random() < pE ? 1 : 0))
    const actualNewE = Math.min(newE, Si)

    // Progression E -> I
    const pI = 1 - Math.exp(-sigma)
    const newI = Math.floor(Ei * pI + (random() < pI ? 1 : 0))
    const actualNewI = Math.min(newI, Ei)

    // Recovery I -> R (gamma = 1/7 days)
    const gamma = 1 / 7
    const pR = 1 - Math.exp(-gamma)
    const newR = Math.floor(Ii * pR + (random() < pR ? 1 : 0))
    const actualNewR = Math.min(newR, Ii)

    ni.seir.S = Si - actualNewE
    ni.seir.E = Ei + actualNewE - actualNewI
    ni.seir.I = Ii + actualNewI - actualNewR
    ni.seir.R = Ri + actualNewR
    ni.prevalence = ni.seir.I / Math.max(Ni, 1)
  }

  return { nodes: next, params: state.params }
}

function simulatePrevalence(
  nodesTemplate: GridNode[],
  params: SEIRState["params"],
  days: number,
  seed: number,
  random: () => number,
): number[][] {
  // returns [day][node] prevalence
  const state = makeSEIRState(nodesTemplate, params, random)
  // seed infection at a random node
  const seedIdx = Math.floor(random() * nodesTemplate.length)
  seedInfection(state, seedIdx, random)

  const out: number[][] = []
  let cur = state
  for (let day = 0; day < days; day++) {
    cur = stepSEIR(cur, random)
    out.push(cur.nodes.map((n) => n.prevalence))
  }
  return out
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

/** Gaussian kernel density estimate evaluated on a grid of xs. */
function kde(samples: number[], xs: number[]): number[] {
  if (samples.length === 0) return xs.map(() => 0)
  // Silverman's rule of thumb bandwidth
  const sorted = samples.slice().sort((a, b) => a - b)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  const iqr = q3 - q1
  const sd = Math.sqrt(
    samples.reduce((a, b) => a + b, 0) / samples.length -
      (samples.reduce((a, b) => a + b, 0) / samples.length) ** 2,
  )
  const a = Math.min(sd, iqr / 1.34)
  const h = 0.9 * Math.min(a, iqr / 1.34) * samples.length ** -0.2
  const bandwidth = Math.max(h, 1e-6)
  const inv = 1 / (samples.length * bandwidth * Math.sqrt(2 * Math.PI))
  return xs.map((x) => {
    let sum = 0
    for (const s of samples) {
      const d = (x - s) / bandwidth
      sum += Math.exp(-0.5 * d * d)
    }
    return inv * sum
  })
}

function densityCurve(samples: number[], nPoints = 60): { x: number; y: number }[] {
  if (samples.length === 0) return []
  const mn = Math.min(...samples)
  const mx = Math.max(...samples)
  const pad = (mx - mn) * 0.1 || 1
  const xs: number[] = []
  for (let i = 0; i < nPoints; i++) {
    xs.push(mn - pad + ((mx - mn + 2 * pad) * i) / (nPoints - 1))
  }
  const ys = kde(samples, xs)
  const yMax = Math.max(...ys)
  return xs.map((x, i) => ({ x, y: yMax > 0 ? ys[i] / yMax : 0 }))
}

export interface Module3Options {
  gridNodes: GridNode[]
  observedPrevalence: number[] // per node observed prevalence (0..1)
  days: number
  generations: number
  particlesPerGen: number
  seed?: number
  priors?: {
    beta: [number, number]
    alpha: [number, number]
    sigmaInv: [number, number]
    vectorEfficiency: [number, number]
  }
  kernel: DispersalKernel
}

export function runModule3Assimilation(opts: Module3Options): Module3Output {
  const {
    gridNodes,
    observedPrevalence,
    days = 30,
    generations = 6,
    particlesPerGen = 300,
    seed,
    kernel = "exponential",
    priors = {
      beta: [0.01, 0.5],
      alpha: [1, 100],
      sigmaInv: [1, 14],
      vectorEfficiency: [0.1, 2],
    },
  } = opts

  const random = rng(seed)
  const paramNames = ["beta", "alpha", "sigmaInv", "vectorEfficiency"]
  const priorRanges = [priors.beta, priors.alpha, priors.sigmaInv, priors.vectorEfficiency]

  // Distance metric: RMSE between simulated and observed mean prevalence
  function distance(simPrev: number[][], obs: number[]): number {
    // compare final-day spatial pattern to observed
    const final = simPrev[simPrev.length - 1]
    let sse = 0
    for (let i = 0; i < obs.length; i++) {
      const d = (final[i] ?? 0) - (obs[i] ?? 0)
      sse += d * d
    }
    return Math.sqrt(sse / Math.max(obs.length, 1))
  }

  function simulate(params: number[]): number[][] {
    const p = {
      beta: params[0],
      alpha: params[1],
      sigmaInv: params[2],
      vectorEfficiency: params[3],
      kernel,
    }
    return simulatePrevalence(gridNodes, p, days, seed ?? 0, random)
  }

  // ---- ABC-SMC ----
  let tolerance: number | undefined
  let particles: number[][] = priorRanges.map(([min, max]) =>
    Array.from({ length: particlesPerGen }, () => sampleUniform(min, max, random)),
  ).reduce((cols, _) => cols, [] as number[][])
  // transpose to particles x params
  particles = Array.from({ length: particlesPerGen }, (_, i) =>
    priorRanges.map((r) => sampleUniform(r[0], r[1], random)),
  )

  let weights = new Array(particlesPerGen).fill(1 / particlesPerGen)

  const toleranceSchedule: ABCSMCToleranceSchedule[] = []
  let acceptedHistory: number[][] = []

  for (let gen = 0; gen < generations; gen++) {
    if (gen === 0) {
      // initial tolerance = 10th percentile of prior distances
      const dists: number[] = []
      for (const p of particles) dists.push(distance(simulate(p), observedPrevalence))
      dists.sort((a, b) => a - b)
      tolerance = dists[Math.floor(dists.length * 0.1)]
    }

    const accepted: number[][] = []
    const newWeights: number[] = []

    for (let i = 0; i < particles.length; i++) {
      let p = particles[i]
      let d = distance(simulate(p), observedPrevalence)
      let attempts = 0
      while (d > tolerance! && attempts < 100) {
        // perturb
        p = p.map((v, j) => {
          const [mn, mx] = priorRanges[j]
          const spread = (mx - mn) * 0.1
          const nv = v + (random() - 0.5) * 2 * spread
          return Math.min(Math.max(nv, mn), mx)
        })
        d = distance(simulate(p), observedPrevalence)
        attempts++
      }
      if (d <= tolerance!) {
        accepted.push(p)
        newWeights.push(weights[i] / Math.max(attempts, 1))
      }
    }

    if (accepted.length === 0) break

    const wSum = newWeights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < newWeights.length; i++) newWeights[i] /= wSum

    particles = accepted
    weights = newWeights
    acceptedHistory = accepted

    toleranceSchedule.push({
      generation: gen,
      epsilon: tolerance!,
      acceptanceRate: accepted.length / particlesPerGen,
      particleCount: accepted.length,
    })

    tolerance = Math.max(tolerance! * 0.5, 0.001)
  }

  // ---- Posterior summaries ----
  const finalParticles = acceptedHistory.length > 0 ? acceptedHistory : particles
  const parameters: ABCSMCParameter[] = paramNames.map((name, j) => {
    const samples = finalParticles.map((p) => p[j]).sort((a, b) => a - b)
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const median = percentile(samples, 50)
    const ciLower = percentile(samples, 2.5)
    const ciUpper = percentile(samples, 97.5)
    // ESS approx: 1 / sum(w^2)
    const wSqSum = weights.reduce((a, b) => a + b * b, 0)
    const ess = 1 / Math.max(wSqSum, 1e-12)
    // Prior samples (uniform over prior range) for density comparison
    const nPrior = samples.length
    const priorSamples: number[] = []
    const [pMin, pMax] = priorRanges[j]
    for (let i = 0; i < nPrior; i++) {
      priorSamples.push(sampleUniform(pMin, pMax, random))
    }
    return {
      name,
      priorMin: pMin,
      priorMax: pMax,
      posteriorMean: Math.round(mean * 1000) / 1000,
      posteriorMedian: Math.round(median * 1000) / 1000,
      ciLower: Math.round(ciLower * 1000) / 1000,
      ciUpper: Math.round(ciUpper * 1000) / 1000,
      ess: Math.round(ess * 100) / 100,
      samples,
      priorSamples,
      priorDensity: densityCurve(priorSamples),
      posteriorDensity: densityCurve(samples),
    }
  })

  const essDiagnostics = parameters.map((p) => ({
    parameter: p.name,
    ess: p.ess,
    passed: p.ess > 100,
  }))

  // ---- Spatial risk grid from posterior median parameters ----
  const medianParams = {
    beta: parameters[0].posteriorMedian,
    alpha: parameters[1].posteriorMedian,
    sigmaInv: parameters[2].posteriorMedian,
    vectorEfficiency: parameters[3].posteriorMedian,
    kernel,
  } as SEIRState["params"]

  // Run ensemble with median params to get prevalence surface
  const ensemble: number[][][] = []
  const nEnsemble = 20
  for (let e = 0; e < nEnsemble; e++) {
    ensemble.push(simulatePrevalence(gridNodes, medianParams, days, seed ?? 0, random))
  }

  const nNodes = gridNodes.length
  const medianPrevalenceMap: number[] = []
  const ciLowerMap: number[] = []
  const ciUpperMap: number[] = []
  const exceedanceMap: number[] = []

  for (let i = 0; i < nNodes; i++) {
    const vals = ensemble.map((run) => run[days - 1][i]).sort((a, b) => a - b)
    medianPrevalenceMap.push(percentile(vals, 50))
    ciLowerMap.push(percentile(vals, 2.5))
    ciUpperMap.push(percentile(vals, 97.5))
    exceedanceMap.push(vals.filter((v) => v > 0.1).length / vals.length) // P(prevalence > 10%)
  }

  const bounds: [[number, number], [number, number]] = [
    [Math.min(...gridNodes.map((n) => n.lat)), Math.min(...gridNodes.map((n) => n.lon))],
    [Math.max(...gridNodes.map((n) => n.lat)), Math.max(...gridNodes.map((n) => n.lon))],
  ]

  // Attach CI / exceedance to grid nodes
  const grid: GridNode[] = gridNodes.map((n, i) => ({
    ...n,
    ciLower: ciLowerMap[i],
    ciUpper: ciUpperMap[i],
    exceedanceProbability: exceedanceMap[i],
  }))

  return {
    parameters,
    toleranceSchedule,
    grid,
    medianPrevalenceMap: reshape(medianPrevalenceMap, gridNodes),
    ciLowerMap: reshape(ciLowerMap, gridNodes),
    ciUpperMap: reshape(ciUpperMap, gridNodes),
    exceedanceMap: reshape(exceedanceMap, gridNodes),
    bounds,
    essDiagnostics,
  }
}

function reshape(vals: number[], nodes: GridNode[]): number[][] {
  // crude square-ish raster
  const n = nodes.length
  const side = Math.ceil(Math.sqrt(n))
  const out: number[][] = []
  for (let r = 0; r < side; r++) {
    const row: number[] = []
    for (let c = 0; c < side; c++) {
      const idx = r * side + c
      row.push(idx < n ? vals[idx] : 0)
    }
    out.push(row)
  }
  return out
}
