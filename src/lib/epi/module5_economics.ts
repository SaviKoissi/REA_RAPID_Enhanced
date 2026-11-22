/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Module5Output,
  PortfolioResult,
  EconomicParameters,
  InterventionCost,
  FAOPrice,
  ParetoPoint,
  InterventionLevers,
  ProjectionTrajectory,
} from "@/types"

const MONTHS_PER_YEAR = 12

/** Default FAO-aligned economic parameters for cassava in Nigeria (illustrative). */
export const DEFAULT_ECONOMIC_PARAMETERS: EconomicParameters = {
  commodity: "Cassava",
  potentialYieldTonsPerHa: 12.0,
  cultivatedAreaHa: 5_000_000,
  farmGatePriceUSDPerTon: 280.0,
  discountRate: 0.08,
  analysisHorizonYears: 5,
  country: "Nigeria",
}

/** Default per-lever intervention cost assumptions (illustrative, USD). */
export const DEFAULT_INTERVENTION_COSTS: Record<keyof InterventionLevers, InterventionCost> = {
  surveillanceFrequency: {
    lever: "surveillanceFrequency",
    unitCostUSD: 45,
    unit: "per_survey",
    fixedCostUSD: 5_000,
  },
  bufferRadiusKm: {
    lever: "bufferRadiusKm",
    unitCostUSD: 120,
    unit: "per_ha",
    fixedCostUSD: 2_000,
  },
  roguingComplianceRate: {
    lever: "roguingComplianceRate",
    unitCostUSD: 0.8,
    unit: "per_plant",
    fixedCostUSD: 1_000,
  },
  roguingResponseDelayDays: {
    lever: "roguingResponseDelayDays",
    unitCostUSD: 15,
    unit: "lump_sum",
    fixedCostUSD: 500,
  },
  cleanPlantingAdoptionRate: {
    lever: "cleanPlantingAdoptionRate",
    unitCostUSD: 350,
    unit: "per_ha",
    fixedCostUSD: 10_000,
  },
  movementRestriction: {
    lever: "movementRestriction",
    unitCostUSD: 8_000,
    unit: "lump_sum",
    fixedCostUSD: 0,
  },
  vectorControlEfficacy: {
    lever: "vectorControlEfficacy",
    unitCostUSD: 60,
    unit: "per_ha",
    fixedCostUSD: 3_000,
  },
  vectorControlTimingDays: {
    lever: "vectorControlTimingDays",
    unitCostUSD: 5,
    unit: "lump_sum",
    fixedCostUSD: 0,
  },
}

function npvFactor(rate: number, year: number): number {
  return 1 / (1 + rate) ** year
}

/**
 * Module 5: Economic Impact & FAO Cost-Effectiveness Engine.
 *
 * Couples physical yield-loss trajectories from Module 4 with FAOSTAT crop
 * production, farm-gate price, and yield-loss valuation methodologies.
 *
 * For each candidate management portfolio:
 *   1. Yield loss (tons) = prevalence × potential yield × cultivated area
 *   2. Revenue loss (USD) = yield loss × farm-gate price
 *   3. NPV of losses = Σ_t revenue_loss_t / (1 + r)^t
 *   4. Benefit = NPV loss avoided vs baseline
 *   5. Cost = sum of lever implementation costs (fixed + variable × area/coverage)
 *   6. BCR = benefit / cost
 *   7. Marginal cost per ha protected = incremental cost / incremental ha protected
 *   8. Pareto frontier: portfolios not dominated in (cost, benefit) space
 */
export interface Module5Options {
  baselineTrajectory: ProjectionTrajectory[]
  controlledTrajectories: Array<{
    id: string
    name: string
    levers: InterventionLevers
    trajectory: ProjectionTrajectory[]
  }>
  economicParameters: EconomicParameters
  interventionCosts?: Partial<Record<keyof InterventionLevers, InterventionCost>>
  cultivatedAreaHa?: number
}

export function runModule5Economics(opts: Module5Options): Module5Output {
  const {
    baselineTrajectory,
    controlledTrajectories = [],
    economicParameters = DEFAULT_ECONOMIC_PARAMETERS,
    interventionCosts = {},
    cultivatedAreaHa,
  } = opts

  const area = cultivatedAreaHa ?? economicParameters.cultivatedAreaHa
  const {
    potentialYieldTonsPerHa,
    farmGatePriceUSDPerTon,
    discountRate,
    analysisHorizonYears,
  } = economicParameters

  const costs: Record<keyof InterventionLevers, InterventionCost> = {
    ...DEFAULT_INTERVENTION_COSTS,
    ...interventionCosts,
  }

  const years = Math.ceil(baselineTrajectory.length / MONTHS_PER_YEAR)
  const horizonYears = Math.min(years, analysisHorizonYears)

  // ---- Baseline NPV loss ----
  let baselineNPVLossUSD = 0
  let baselineYieldLossTons = 0
  for (let t = 0; t < baselineTrajectory.length; t++) {
    const yearIndex = Math.floor(t / MONTHS_PER_YEAR)
    if (yearIndex >= horizonYears) break
    const prev = baselineTrajectory[t].meanPrevalence
    const tonsLost = prev * potentialYieldTonsPerHa * area
    baselineYieldLossTons += tonsLost / MONTHS_PER_YEAR // annualize monthly points
    const revenueLost = tonsLost * farmGatePriceUSDPerTon
    baselineNPVLossUSD += revenueLost * npvFactor(discountRate, yearIndex)
  }

  // ---- Evaluate each controlled portfolio ----
  const portfolios: PortfolioResult[] = controlledTrajectories.map((sc, idx) => {
    let revenueLossControlledUSD = 0
    let yieldLossControlledTons = 0
    for (let t = 0; t < sc.trajectory.length; t++) {
      const yearIndex = Math.floor(t / MONTHS_PER_YEAR)
      if (yearIndex >= horizonYears) break
      const prev = sc.trajectory[t].meanPrevalence
      const tonsLost = prev * potentialYieldTonsPerHa * area
      yieldLossControlledTons += tonsLost / MONTHS_PER_YEAR
      revenueLossControlledUSD += tonsLost * farmGatePriceUSDPerTon * npvFactor(discountRate, yearIndex)
    }

    const yieldSavedTons = Math.max(0, baselineYieldLossTons - yieldLossControlledTons)
    const revenueSavedUSD = Math.max(0, baselineNPVLossUSD - revenueLossControlledUSD)

    // Intervention cost: fixed + variable scaled by lever intensity & area
    let interventionCostUSD = 0
    const leverKeys = Object.keys(sc.levers) as (keyof InterventionLevers)[]
    for (const lever of leverKeys) {
      const cost = costs[lever]
      const value = sc.levers[lever]
      let variable = 0
      if (typeof value === "number") {
        // scale variable cost by lever intensity (0..1 normalized) × area
        const norm = leverNormalize(lever, value)
        variable = cost.unitCostUSD * norm * area
      } else if (value === true) {
        variable = cost.unitCostUSD
      }
      interventionCostUSD += cost.fixedCostUSD + variable
    }

    const netBenefitUSD = revenueSavedUSD - interventionCostUSD
    const bcr = interventionCostUSD > 0 ? revenueSavedUSD / interventionCostUSD : 0
    const npvSavedUSD = revenueSavedUSD

    // Marginal cost per ha protected (vs doing nothing)
    const haProtected = area * (yieldSavedTons / Math.max(baselineYieldLossTons, 1))
    const marginalCostUSDPerHaProtected =
      haProtected > 0 ? interventionCostUSD / haProtected : 0

    return {
      id: `portfolio_${idx}`,
      name: sc.name,
      levers: sc.levers,
      yieldLossTonsBaseline: Math.round(baselineYieldLossTons * 100) / 100,
      yieldLossTonsControlled: Math.round(yieldLossControlledTons * 100) / 100,
      yieldSavedTons: Math.round(yieldSavedTons * 100) / 100,
      revenueLossBaselineUSD: Math.round(baselineNPVLossUSD * 100) / 100,
      revenueLossControlledUSD: Math.round(revenueLossControlledUSD * 100) / 100,
      revenueSavedUSD: Math.round(revenueSavedUSD * 100) / 100,
      interventionCostUSD: Math.round(interventionCostUSD * 100) / 100,
      netBenefitUSD: Math.round(netBenefitUSD * 100) / 100,
      npvSavedUSD: Math.round(npvSavedUSD * 100) / 100,
      benefitCostRatio: Math.round(bcr * 100) / 100,
      marginalCostUSDPerHaProtected: Math.round(marginalCostUSDPerHaProtected * 100) / 100,
      isParetoOptimal: false,
    }
  })

  // ---- Pareto frontier (max benefit, min cost) ----
  const pareto = portfolios.filter((p) => {
    const dominated = portfolios.some(
      (q) =>
        q.id !== p.id &&
        q.npvSavedUSD >= p.npvSavedUSD &&
        q.interventionCostUSD <= p.interventionCostUSD &&
        (q.npvSavedUSD > p.npvSavedUSD || q.interventionCostUSD < p.interventionCostUSD)
    )
    return !dominated
  })
  for (const p of portfolios) {
    p.isParetoOptimal = pareto.some((q) => q.id === p.id)
  }

  const bestBCR = portfolios.reduce((best, p) =>
    p.benefitCostRatio > best.benefitCostRatio ? p : best
  , portfolios[0])
  const bestNPV = portfolios.reduce((best, p) =>
    p.npvSavedUSD > best.npvSavedUSD ? p : best
  , portfolios[0])

  return {
    portfolios,
    paretoFrontier: pareto,
    economicParameters,
    totalCultivatedAreaHa: area,
    baselineNPVLossUSD: Math.round(baselineNPVLossUSD * 100) / 100,
    bestBCRPortfolio: bestBCR,
    bestNPVPortfolio: bestNPV,
  }
}

/** Normalize a lever value to 0..1 intensity for cost scaling. */
function leverNormalize(lever: keyof InterventionLevers, value: number): number {
  switch (lever) {
    case "surveillanceFrequency": return clamp01(value / 12)
    case "bufferRadiusKm": return clamp01(value / 50)
    case "roguingComplianceRate": return clamp01(value)
    case "roguingResponseDelayDays": return clamp01(1 - value / 120) // faster = cheaper?
    case "cleanPlantingAdoptionRate": return clamp01(value)
    case "movementRestriction": return 1
    case "vectorControlEfficacy": return clamp01(value)
    case "vectorControlTimingDays": return clamp01(1 - value / 180)
    default: return 0
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
