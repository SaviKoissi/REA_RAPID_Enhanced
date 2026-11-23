"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, FlaskConical, Layers, ShieldAlert, BarChart3, RefreshCw, TrendingUp, PieChart } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { MapView } from "@/components/map/map-view"
import { ParetoChart, DecisionMatrix } from "@/components/epi/pareto-chart"
import { t } from "@/lib/i18n"
import { runModule4Forecast, DEFAULT_LEVERS } from "@/lib/epi/module4_forecast"
import {
  runModule5Economics,
  DEFAULT_ECONOMIC_PARAMETERS,
} from "@/lib/epi/module5_economics"
import type { FieldRecord, GridNode, InterventionLevers, EconomicParameters, ScenarioId } from "@/types"

const CENTER: [number, number] = [9.08, 7.42]
const BOUNDS: [[number, number], [number, number]] = [
  [2.68, 4.0],
  [14.68, 13.9],
]

function buildGridNodes(records: FieldRecord[]): GridNode[] {
  const seen = new Set<string>()
  const nodes: GridNode[] = []
  const add = (lat: number, lon: number, hd: number, prev: number) => {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
    if (seen.has(key)) return
    seen.add(key)
    nodes.push({
      id: `node_${lat}_${lon}`,
      lat,
      lon,
      seir: { S: 90, E: 5, I: 5, R: 0 },
      hostDensity: hd,
      prevalence: prev,
      ciLower: 0,
      ciUpper: 0,
      exceedanceProbability: 0,
    })
  }
  for (const r of records) {
    add(
      r.latitude,
      r.longitude,
      r.host_crop === "cassava" || r.host_crop === "banana" ? 0.8 : 0.4,
      r.diagnostic_status === "Infectious" || r.diagnostic_status === "Exposed" ? 0.3 : 0.02,
    )
  }
  if (nodes.length < 30) {
    for (let i = 0; i < 30; i++) {
      const lat = 4 + Math.random() * 10
      const lon = 2.5 + Math.random() * 12
      add(lat, lon, 0.5, 0.05)
    }
  }
  return nodes
}

const ECON_CONTROLS: Array<{
  key: keyof EconomicParameters
  label: string
  unit: string
  min: number
  max: number
  step: number
}> = [
  { key: "potentialYieldTonsPerHa", label: "Potential yield", unit: "t/ha", min: 1, max: 40, step: 1 },
  { key: "cultivatedAreaHa", label: "Cultivated area", unit: "ha", min: 1_000, max: 50_000_000, step: 100_000 },
  { key: "farmGatePriceUSDPerTon", label: "Farm-gate price", unit: "USD/t", min: 50, max: 2000, step: 10 },
  { key: "discountRate", label: "Discount rate", unit: "0–1", min: 0, max: 0.2, step: 0.01 },
  { key: "analysisHorizonYears", label: "Analysis horizon", unit: "years", min: 1, max: 20, step: 1 },
]

export default function Module5Page() {
  const [records, setRecords] = useState<FieldRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ReturnType<typeof runModule5Economics> | null>(null)
  const [econ, setEcon] = useState<EconomicParameters>({ ...DEFAULT_ECONOMIC_PARAMETERS })
  const [months, setMonths] = useState(24)
  const [ensemble, setEnsemble] = useState(30)

  const compute = useCallback(() => {
    const gridNodes = buildGridNodes(records)
    const posteriorParameters = [
      { name: "beta", priorMin: 0.01, priorMax: 0.5, posteriorMedian: 0.12, posteriorMean: 0.12, ciLower: 0.05, ciUpper: 0.25, ess: 150, samples: [], priorSamples: [], priorDensity: [], posteriorDensity: [] },
      { name: "alpha", priorMin: 1, priorMax: 100, posteriorMedian: 25, posteriorMean: 25, ciLower: 10, ciUpper: 60, ess: 140, samples: [], priorSamples: [], priorDensity: [], posteriorDensity: [] },
      { name: "sigmaInv", priorMin: 1, priorMax: 14, posteriorMedian: 7, posteriorMean: 7, ciLower: 4, ciUpper: 11, ess: 160, samples: [], priorSamples: [], priorDensity: [], posteriorDensity: [] },
      { name: "vectorEfficiency", priorMin: 0.1, priorMax: 2, posteriorMedian: 1, posteriorMean: 1, ciLower: 0.5, ciUpper: 1.6, ess: 155, samples: [], priorSamples: [], priorDensity: [], posteriorDensity: [] },
    ]
    const module4 = runModule4Forecast({
      gridNodes,
      posteriorParameters,
      months,
      ensembleSize: ensemble,
      seed: 42,
      managementLevers: DEFAULT_LEVERS,
    })

    // Build controlled portfolios from Module 4 scenarios + a few lever variations
    const controlled = module4.scenarios.map((s, i) => ({
      id: s.id,
      name: s.name,
      levers: s.levers,
      trajectory: s.trajectories,
    }))

    // Add alternative portfolios for decision space exploration
    const altLevers: InterventionLevers[] = [
      { ...DEFAULT_LEVERS, roguingComplianceRate: 0.9, cleanPlantingAdoptionRate: 0.8 },
      { ...DEFAULT_LEVERS, movementRestriction: true, vectorControlEfficacy: 0.8 },
      { ...DEFAULT_LEVERS, surveillanceFrequency: 6, bufferRadiusKm: 15 },
    ]
    altLevers.forEach((l, i) => {
      const alt = runModule4Forecast({
        gridNodes,
        posteriorParameters,
        months,
        ensembleSize: ensemble,
        seed: 100 + i,
        managementLevers: l,
      })
      const sc = alt.scenarios.find((s) => s.id === "management_interventions")
      if (sc) {
        controlled.push({ id: `alt_${i}` as ScenarioId, name: `Portfolio ${i + 2}`, levers: l, trajectory: sc.trajectories })
      }
    })

    setResult(
      runModule5Economics({
        baselineTrajectory: module4.scenarios.find((s) => s.id === "no_control")?.trajectories ?? [],
        controlledTrajectories: controlled,
        economicParameters: econ,
      }),
    )
  }, [records, econ, months, ensemble])

  useEffect(() => {
    let cancelled = false
    fetch("/api/observatory?orgId=org_wave_001")
      .then((r) => r.json())
      .then((data: FieldRecord[]) => {
        if (cancelled) return
        setRecords(data)
        setLoading(false)
        compute()
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
        compute()
      })
    return () => {
      cancelled = true
    }
  }, [])

  const portfolios = result?.portfolios ?? []
  const pareto = result?.paretoFrontier ?? []
  const bestBCR = result?.bestBCRPortfolio
  const bestNPV = result?.bestNPVPortfolio

  const paretoPoints: Array<{ x: number; y: number; portfolioId: string; name: string; bcr: number }> =
    portfolios.map((p) => ({
      x: p.interventionCostUSD,
      y: p.npvSavedUSD,
      portfolioId: p.id,
      name: p.name,
      bcr: p.benefitCostRatio,
    }))

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            5. Economic Impact & Cost-Effectiveness (FAO)
          </h1>
          <p className="text-muted-foreground text-sm">
            FAOSTAT yield-loss valuation: tonnage lost × farm-gate price, NPV, BCR,
            and marginal cost per hectare protected.
          </p>
        </div>
        <Badge variant="outline">
          <PieChart size={14} className="mr-1.5" /> FAO
        </Badge>
      </div>

      {/* Economic parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert size={14} /> Valuation parameters (FAOSTAT-aligned)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {ECON_CONTROLS.map((c) => (
              <div key={c.key} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{c.label}</label>
                <Input
                  type="number"
                  step={c.step}
                  min={c.min}
                  max={c.max}
                  value={String(econ[c.key])}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isNaN(v)) setEcon((prev) => ({ ...prev, [c.key]: v as EconomicParameters[keyof EconomicParameters] }))
                  }}
                />
                <div className="text-[9px] text-muted-foreground">{c.unit}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Time horizon (months)</label>
              <Input
                type="number"
                value={months}
                onChange={(e) => setMonths(Math.max(6, Number(e.target.value) || 6))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Ensemble size</label>
              <Input
                type="number"
                value={ensemble}
                onChange={(e) => setEnsemble(Math.max(10, Number(e.target.value) || 10))}
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => compute()}
            className="mt-2 flex items-center gap-2 w-auto"
          >
            <RefreshCw size={14} /> Re-run valuation
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-[520px] flex items-center justify-center rounded-xl bg-muted/50">
          <span className="text-muted-foreground">Running cost-effectiveness analysis…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: headline metrics */}
          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Baseline NPV loss</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-mono font-bold text-destructive">
                  ${(result?.baselineNPVLossUSD ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">USD over analysis horizon</div>
              </CardContent>
            </Card>
            {bestBCR && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Best BCR portfolio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-3">
                  <div className="text-xs text-muted-foreground">{bestBCR.name}</div>
                  <div className="text-lg font-mono font-bold">{bestBCR.benefitCostRatio.toFixed(2)}×</div>
                  <div className="text-xs text-muted-foreground">NPV saved ${bestBCR.npvSavedUSD.toLocaleString()}</div>
                </CardContent>
              </Card>
            )}
            {bestNPV && bestNPV !== bestBCR && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Best NPV portfolio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-3">
                  <div className="text-xs text-muted-foreground">{bestNPV.name}</div>
                  <div className="text-lg font-mono font-bold">${bestNPV.npvSavedUSD.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">BCR {bestNPV.benefitCostRatio.toFixed(2)}×</div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Area under analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-mono font-bold">
                  {result?.totalCultivatedAreaHa.toLocaleString() ?? 0} ha
                </div>
                <div className="text-xs text-muted-foreground">cultivated area</div>
              </CardContent>
            </Card>
          </div>

          {/* Center: Pareto frontier */}
          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp size={14} /> Pareto frontier
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ParetoChart points={paretoPoints} highlighted={bestNPV?.id} />
              </CardContent>
            </Card>
          </div>

          {/* Right: decision matrix */}
          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 size={14} /> Decision matrix
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DecisionMatrix
                  portfolios={portfolios}
                  selectedId={bestNPV?.id}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
