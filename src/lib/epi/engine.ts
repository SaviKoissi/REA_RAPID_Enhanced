import type { ABCSMCResult, UncertaintyMap, ScenarioComparison } from "@/types"

function safeUUID(): string {
  try {
    if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


interface ABCSMCParams {
  parameterNames: string[]
  priors: Array<{ min: number; max: number }>
  simulate: (params: number[]) => number[]
  observed: number[]
  distance: (sim: number[], obs: number[]) => number
  generations?: number
  particlesPerGen?: number
  initialTolerance?: number
  finalTolerance?: number
  seed?: number
}

function rng(seed: number | undefined) {
  let s = seed ?? Date.now()
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

export function runABCSMC(params: ABCSMCParams): ABCSMCResult {
  const random = rng(params.seed)
  const {
    parameterNames,
    priors,
    simulate,
    observed,
    distance,
    generations = 5,
    particlesPerGen = 500,
    initialTolerance,
    finalTolerance = 0.05,
  } = params

  const dim = parameterNames.length
  const initTol = initialToleranceFunc(initialTolerance, priors, observed, simulate, distance, random, particlesPerGen)

  let tolerance = initTol
  let particles: number[][] = samplePrior(priors, particlesPerGen, random)
  let weights = new Array(particlesPerGen).fill(1 / particlesPerGen)

  let acceptedHistory: number[][] = []

  for (let gen = 0; gen < generations; gen++) {
    const accepted: number[][] = []
    const newWeights: number[] = []

    for (let i = 0; i < particles.length; i++) {
      let p = particles[i]
      let d = distance(simulate(p), observed)
      let attempts = 0
      while (d > tolerance && attempts < 100) {
        p = perturb(p, priors, random)
        d = distance(simulate(p), observed)
        attempts++
      }
      if (d <= tolerance) {
        accepted.push(p)
        newWeights.push(weights[i] / Math.max(attempts, 1))
      }
    }

    if (accepted.length === 0) break

    // Normalize weights
    const wSum = newWeights.reduce<number>((a, b) => a + b, 0)
    for (let i = 0; i < newWeights.length; i++) newWeights[i] /= wSum

    particles = accepted
    weights = newWeights
    acceptedHistory = accepted

    // Decrease tolerance geometrically
    tolerance = Math.max(finalTolerance, tolerance * 0.5)
  }

  const acceptanceRate = acceptedHistory.length / (particlesPerGen * generations)

  return {
    posteriorSamples: acceptedHistory,
    parameterNames,
    acceptanceRate,
    generations,
    tolerance,
    timestamp: new Date().toISOString(),
  }
}

function initialToleranceFunc(
  tol: number | undefined,
  priors: { min: number; max: number }[],
  observed: number[],
  simulate: (params: number[]) => number[],
  distance: (sim: number[], obs: number[]) => number,
  random: () => number,
  n: number
): number {
  if (tol) return tol
  const dists: number[] = []
  for (let i = 0; i < n; i++) {
    const p = samplePrior(priors, 1, random)[0]
    dists.push(distance(simulate(p), observed))
  }
  dists.sort((a, b) => a - b)
  return dists[Math.floor(dists.length * 0.1)] // 10th percentile
}

function samplePrior(
  priors: { min: number; max: number }[],
  n: number,
  random: () => number
): number[][] {
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    out.push(priors.map((pr) => pr.min + random() * (pr.max - pr.min)))
  }
  return out
}

function perturb(
  params: number[],
  priors: { min: number; max: number }[],
  random: () => number
): number[] {
  return params.map((p, i) => {
    const pr = priors[i]
    const spread = (pr.max - pr.min) * 0.1
    const val = p + (random() - 0.5) * 2 * spread
    return Math.min(Math.max(val, pr.min), pr.max)
  })
}

/* ---------- Uncertainty cartography ---------- */

interface KrigingGrid {
  bounds: [[number, number], [number, number]]
  resolution: number
}

export function computeUncertaintyMap(
  points: Array<{ x: number; y: number; value: number }>,
  opts: KrigingGrid & { method: "kriging" | "idw" | "kernel"; confidence: number }
): UncertaintyMap {
  const [[minX, minY], [maxX, maxY]] = opts.bounds
  const res = opts.resolution || 50
  const nx = res
  const ny = res
  const dx = (maxX - minX) / (nx - 1)
  const dy = (maxY - minY) / (ny - 1)

  const mean: number[][] = []
  const variance: number[][] = []
  const lower: number[][] = []
  const upper: number[][] = []

  const zCrit = opts.confidence === 0.95 ? 1.96 : opts.confidence === 0.99 ? 2.576 : 1.645

  for (let j = 0; j < ny; j++) {
    const meanRow: number[] = []
    const varRow: number[] = []
    const lowerRow: number[] = []
    const upperRow: number[] = []
    const y = minY + j * dy
    for (let i = 0; i < nx; i++) {
      const x = minX + i * dx
      let m = 0
      let wsum = 0
      let s2 = 0
      for (const pt of points) {
        const d = Math.hypot(x - pt.x, y - pt.y) + 1e-6
        let w: number
        if (opts.method === "idw") w = 1 / (d * d)
        else if (opts.method === "kernel") w = Math.exp(-(d * d) / (2 * 0.5 * 0.5))
        else w = Math.exp(-d / 2) // exponential semi-variogram approx (kriging-like)
        m += pt.value * w
        wsum += w
      }
      m = wsum > 0 ? m / wsum : 0
      // local variance from residual spread
      for (const pt of points) {
        const d = Math.hypot(x - pt.x, y - pt.y) + 1e-6
        let w: number
        if (opts.method === "idw") w = 1 / (d * d)
        else if (opts.method === "kernel") w = Math.exp(-(d * d) / (2 * 0.5 * 0.5))
        else w = Math.exp(-d / 2)
        s2 += w * (pt.value - m) * (pt.value - m)
      }
      s2 = wsum > 0 ? s2 / wsum : 0
      meanRow.push(m)
      varRow.push(s2)
      lowerRow.push(m - zCrit * Math.sqrt(s2))
      upperRow.push(m + zCrit * Math.sqrt(s2))
    }
    mean.push(meanRow)
    variance.push(varRow)
    lower.push(lowerRow)
    upper.push(upperRow)
  }

  return {
    id: `unc_${safeUUID()}`,
    mean,
    variance,
    confidenceInterval: { lower, upper },
    bounds: opts.bounds,
    method: opts.method,
  }
}

/* ---------- Scenario comparison ---------- */

export function compareScenarios(
  scenarios: Array<{ id: string; name: string; metricValues: Record<string, number> }>
): ScenarioComparison {
  const scenarioIds = scenarios.map((s) => s.id)
  const metricNames = Array.from(new Set(scenarios.flatMap((s) => Object.keys(s.metricValues))))
  const metrics: Record<string, number[]> = {}
  const baseline = scenarios[0]

  for (const metric of metricNames) {
    metrics[metric] = scenarios.map((s) => s.metricValues[metric] ?? 0)
  }

  const delta: Record<string, number> = {}
  for (let i = 1; i < scenarios.length; i++) {
    for (const metric of metricNames) {
      const b = baseline.metricValues[metric] ?? 0
      const cur = scenarios[i].metricValues[metric] ?? 0
      delta[`${scenarios[i].id}:${metric}`] = cur - b
    }
  }

  return {
    id: `scen_${safeUUID()}`,
    name: "Scenario comparison",
    scenarioIds,
    metrics,
    delta,
    createdAt: new Date().toISOString(),
  }
}
