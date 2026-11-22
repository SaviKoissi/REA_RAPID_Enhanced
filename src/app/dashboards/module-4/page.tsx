"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, FlaskConical, Layers, ShieldAlert, BarChart3, RefreshCw, MapPin, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { MapView } from "@/components/map/map-view"
import { FanChart, ScenarioCard } from "@/components/epi/fan-chart"
import { t } from "@/lib/i18n"
import {
  runModule4Forecast,
  DEFAULT_LEVERS,
} from "@/lib/epi/module4_forecast"
import type { FieldRecord, GridNode, InterventionLevers } from "@/types"

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

const LEVER_CONTROLS: Array<{
  key: keyof InterventionLevers
  label: string
  unit: string
  min: number
  max: number
  step: number
  type: "number" | "boolean"
}> = [
  { key: "surveillanceFrequency", label: "Surveillance frequency", unit: "surveys/month", min: 0, max: 12, step: 1, type: "number" },
  { key: "bufferRadiusKm", label: "Delimitation buffer radius", unit: "km", min: 0, max: 50, step: 5, type: "number" },
  { key: "roguingComplianceRate", label: "Roguing compliance", unit: "0–1", min: 0, max: 1, step: 0.1, type: "number" },
  { key: "roguingResponseDelayDays", label: "Roguing response delay", unit: "days", min: 0, max: 120, step: 7, type: "number" },
  { key: "cleanPlantingAdoptionRate", label: "Clean planting adoption", unit: "0–1", min: 0, max: 1, step: 0.1, type: "number" },
  { key: "movementRestriction", label: "Movement restriction / quarantine", unit: "", min: 0, max: 1, step: 1, type: "boolean" },
  { key: "vectorControlEfficacy", label: "Vector control efficacy", unit: "0–1", min: 0, max: 1, step: 0.1, type: "number" },
  { key: "vectorControlTimingDays", label: "Vector control timing", unit: "days", min: 0, max: 180, step: 14, type: "number" },
]

export default function Module4Page() {
  const [records, setRecords] = useState<FieldRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ReturnType<typeof runModule4Forecast> | null>(null)
  const [levers, setLevers] = useState<InterventionLevers>({ ...DEFAULT_LEVERS })
  const [months, setMonths] = useState(24)
  const [ensemble, setEnsemble] = useState(30)

  const compute = useCallback(() => {
    const gridNodes = buildGridNodes(records)
    // Posterior parameters placeholder from Module 3 (flat medians)
    const posteriorParameters = [
      { name: "beta", priorMin: 0.01, priorMax: 0.5, posteriorMedian: 0.12, posteriorMean: 0.12, ciLower: 0.05, ciUpper: 0.25, ess: 150, samples: [], priorSamples: [], priorDensity: [], posteriorDensity: [] },
      { name: "alpha", priorMin: 1, priorMax: 100, posteriorMedian: 25, posteriorMean: 25, ciLower: 10, ciUpper: 60, ess: 140, samples: [], priorSamples: [], priorDensity: [], posteriorDensity: [] },
      { name: "sigmaInv", priorMin: 1, priorMax: 14, posteriorMedian: 7, posteriorMean: 7, ciLower: 4, ciUpper: 11, ess: 160, samples: [], priorSamples: [], priorDensity: [], posteriorDensity: [] },
      { name: "vectorEfficiency", priorMin: 0.1, priorMax: 2, posteriorMedian: 1, posteriorMean: 1, ciLower: 0.5, ciUpper: 1.6, ess: 155, samples: [], priorSamples: [], priorDensity: [], posteriorDensity: [] },
    ]
    setResult(
      runModule4Forecast({
        gridNodes,
        posteriorParameters,
        months,
        ensembleSize: ensemble,
        seed: 42,
        managementLevers: levers,
      }),
    )
  }, [records, levers, months, ensemble])

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

  const scenarios = result?.scenarios ?? []
  const baseline = scenarios.find((s) => s.id === "no_control")
  const controlled = scenarios.find((s) => s.id === "management_interventions")

  // Map markers colored by final prevalence per scenario
  const snapshots = controlled?.gridSnapshots ?? baseline?.gridSnapshots ?? []
  const finalSnap = snapshots[snapshots.length - 1] ?? { timeStep: 0, prevalence: [] }
  const gridNodes = buildGridNodes(records)
  const markers = gridNodes.map((n, i) => {
    const prev = finalSnap.prevalence[i] ?? 0
    const color = prev > 0.33 ? "#ef4444" : prev > 0.15 ? "#eab308" : "#22c55e"
    return {
      position: [n.lat, n.lon] as [number, number],
      label: `Node ${i}: prev=${prev.toFixed(2)}`,
      color,
    } as { position: [number, number]; label?: string; color?: string }
  })

  const circles = gridNodes.map((n, i) => {
    const exceed = finalSnap.prevalence[i] ?? 0
    return {
      position: [n.lat, n.lon] as [number, number],
      radius: Math.max(1500, exceed * 50000),
      color: exceed > 0.33 ? "#ef4444" : exceed > 0.15 ? "#eab308" : "#22c55e",
      fill: exceed > 0.33 ? "#ef4444" : exceed > 0.15 ? "#eab308" : "#22c55e",
      label: `P(prev>10%)=${exceed.toFixed(2)}`,
    }
  })

  const handleLeverChange = (
    key: keyof InterventionLevers,
    value: string | boolean | number,
  ) => {
    setLevers((prev) => ({
      ...prev,
      [key]: value as InterventionLevers[keyof InterventionLevers],
    }))
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            4/5. Future Spread Forecasting & Intervention Scenarios
          </h1>
          <p className="text-muted-foreground text-sm">
            Forward stochastic ensemble projections from ABC-SMC posterior particles comparing Card 4
            (No Control) vs Card 5 (Management Interventions).
          </p>
        </div>
        <Badge variant="outline">
          <Activity size={14} className="mr-1.5" /> Ensemble
        </Badge>
      </div>

      {/* Control levers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical size={14} /> Card 5 — Management intervention levers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {LEVER_CONTROLS.map((c) => (
              <div key={c.key} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{c.label}</label>
                {c.type === "boolean" ? (
                  <Toggle
                    checked={levers[c.key] as boolean}
                    onCheckedChange={(v) => handleLeverChange(c.key, v)}
                  />
                ) : (
                  <Input
                    type="number"
                    step={c.step}
                    min={c.min}
                    max={c.max}
                    value={String(levers[c.key])}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isNaN(v)) handleLeverChange(c.key, v)
                    }}
                  />
                )}
                <div className="text-[9px] text-muted-foreground flex justify-between">
                  <span>{c.min}</span>
                  <span>{c.unit}</span>
                  <span>{c.max}</span>
                </div>
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
            <RefreshCw size={14} /> Re-run projections
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-[520px] flex items-center justify-center rounded-xl bg-muted/50">
          <span className="text-muted-foreground">Running ensemble projections…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: fan chart + scenario cards */}
          <div className="lg:col-span-7 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp size={14} /> Multi-trajectory fan chart (95% CI)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FanChart
                  scenarios={scenarios.map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    trajectories: s.trajectories,
                  }))}
                />
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              {baseline && <ScenarioCard scenario={{ ...baseline }} isBaseline />}
              {controlled && <ScenarioCard scenario={{ ...controlled }} />}
            </div>
          </div>

          {/* Right: synchronized spatial spread heatmap */}
          <div className="lg:col-span-5 space-y-4">
            <Card>
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Projected infection density (final month)</CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[520px]">
                <MapView center={CENTER} zoom={5} layers={[]} markers={markers} circles={circles} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin size={14} /> Comparison at final month
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3">
                {baseline && controlled && (
                  <>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Card 4 — No control final prevalence</span>
                      <span className="font-mono text-red-700">{baseline.finalPrevalence.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Card 5 — With interventions final prevalence</span>
                      <span className="font-mono text-purple-700">{controlled.finalPrevalence.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Total cases averted</span>
                      <span className="font-mono text-green-700">
                        {controlled.totalCasesAvertedVsBaseline.toLocaleString()}
                      </span>
                    </div>
                    <Separator />
                    <div className="text-xs text-muted-foreground">
                      Red = high projected infection density. Purple overlay = controlled scenario.
                      Intensified surveillance, roguing, clean planting material, quarantine zones,
                      and vector control reduce the final epidemic size.
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
