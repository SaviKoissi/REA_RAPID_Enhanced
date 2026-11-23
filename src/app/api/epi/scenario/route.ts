import { NextResponse } from "next/server"
import { compareScenarios } from "@/lib/epi/engine"

interface ScenarioInput {
  id?: string
  name?: string
  pathosystem?: string
  horizonMonths?: number
  roguingCompliance?: number
  cleanSeedAdoption?: number
  vectorControlEfficacy?: number
  bufferRadiusKm?: number
  metricValues?: Record<string, number>
}

function evaluateScenarioMetrics(s: ScenarioInput): Record<string, number> {
  if (s.metricValues && Object.keys(s.metricValues).length > 0) {
    return s.metricValues
  }
  const isCbsd = (s.pathosystem ?? "CBSD") === "CBSD"
  const horizon = s.horizonMonths ?? 36
  const roguing = s.roguingCompliance ?? 0
  const cleanSeed = s.cleanSeedAdoption ?? 0
  const vectorCtrl = s.vectorControlEfficacy ?? 0
  const buffer = s.bufferRadiusKm ?? 0

  const suppression = Math.min(0.88, 0.38 * roguing + 0.34 * cleanSeed + 0.22 * vectorCtrl + Math.min(0.12, buffer * 0.015))
  const baseInfectedHa = (isCbsd ? 42000 : 12500) * (horizon / 36)
  const infectedHa = Math.round(baseInfectedHa * (1 - suppression))
  const yieldPerHa = isCbsd ? 11.8 : 14.2
  const lossFrac = isCbsd ? 0.68 : 0.90
  const pricePerTon = isCbsd ? 145 : 260

  const yieldLossTons = Math.round(infectedHa * yieldPerHa * lossFrac)
  const economicLossUsd = Math.round(yieldLossTons * pricePerTon)
  const programCostUsd = Math.round(
    (roguing * 80 + cleanSeed * 160 + vectorCtrl * 55 + buffer * 18) * (isCbsd ? 18500 : 6200)
  )

  return {
    infectedHectares: infectedHa,
    yieldLossTons,
    economicLossUsd,
    programCostUsd,
    suppressionPct: Math.round(suppression * 1000) / 10,
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const rawScenarios: ScenarioInput[] = Array.isArray(body.scenarios) ? body.scenarios : []
    if (rawScenarios.length === 0) {
      return NextResponse.json({ error: "scenarios array is required" }, { status: 400 })
    }

    const normalized = rawScenarios.map((s, idx) => ({
      id: s.id ?? `scenario_${idx + 1}`,
      name: s.name ?? `Scenario ${idx + 1}`,
      metricValues: evaluateScenarioMetrics(s),
    }))

    const comparison = compareScenarios(normalized)
    return NextResponse.json({ ...comparison, scenarios: normalized })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scenario comparison failed" },
      { status: 400 }
    )
  }
}
