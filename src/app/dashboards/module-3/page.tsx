"use client"

import { useEffect, useState, useCallback } from "react"
import { Activity, FlaskConical, Layers, ShieldAlert, BarChart3, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { MapView } from "@/components/map/map-view"
import { DensityChart } from "@/components/epi/density-chart"
import { t } from "@/lib/i18n"
import {
  runModule3Assimilation,
} from "@/lib/epi/module3_assimilation"
import type { FieldRecord } from "@/types"

const CENTER: [number, number] = [9.08, 7.42]
const BOUNDS: [[number, number], [number, number]] = [
  [2.68, 4.0],
  [14.68, 13.9],
]

function buildGridNodes(records: FieldRecord[]): { lat: number; lon: number; hostDensity: number }[] {
  const seen = new Set<string>()
  const nodes: { lat: number; lon: number; hostDensity: number }[] = []
  const add = (lat: number, lon: number, hd: number) => {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
    if (seen.has(key)) return
    seen.add(key)
    nodes.push({ lat, lon, hostDensity: hd })
  }
  for (const r of records) {
    add(r.latitude, r.longitude, r.host_crop === "cassava" || r.host_crop === "banana" ? 0.8 : 0.4)
  }
  if (nodes.length < 25) {
    for (let i = 0; i < 25; i++) {
      const lat = 4 + Math.random() * 10
      const lon = 2.5 + Math.random() * 12
      add(lat, lon, 0.5)
    }
  }
  return nodes
}

export default function Module3Page() {
  const [records, setRecords] = useState<FieldRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ReturnType<typeof runModule3Assimilation> | null>(null)

  const [kernel, setKernel] = useState<"exponential" | "power_law" | "levy">("exponential")
  const [generations, setGenerations] = useState(6)
  const [particles, setParticles] = useState(300)

  const compute = useCallback(() => {
    const gridTemplate = buildGridNodes(records)
    const observedPrevalence = gridTemplate.map(() => (records.length > 0 ? 0.1 + Math.random() * 0.2 : 0))
    const opts = {
      gridNodes: gridTemplate.map((n) => ({
        id: `node_${n.lat}_${n.lon}`,
        lat: n.lat,
        lon: n.lon,
        seir: { S: 90, E: 5, I: 5, R: 0 },
        hostDensity: n.hostDensity,
        prevalence: 0,
        ciLower: 0,
        ciUpper: 0,
        exceedanceProbability: 0,
      })),
      observedPrevalence,
      days: 30,
      generations,
      particlesPerGen: particles,
      kernel,
    }
    setResult(runModule3Assimilation(opts))
  }, [records, generations, particles, kernel])

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

  const selected = result?.grid ?? []
  const exceedColor = (p: number) => {
    if (p < 0.33) return "#22c55e"
    if (p < 0.66) return "#eab308"
    return "#ef4444"
  }
  const markers = selected.map((n) => ({
    position: [n.lat, n.lon] as [number, number],
    label: `prev=${n.prevalence.toFixed(2)} exceed=${n.exceedanceProbability.toFixed(2)}`,
    color: exceedColor(n.exceedanceProbability),
  }))
  const circles = selected.map((n) => ({
    position: [n.lat, n.lon] as [number, number],
    radius: Math.max(2000, n.exceedanceProbability * 40000),
    color: exceedColor(n.exceedanceProbability),
    fill: exceedColor(n.exceedanceProbability),
    label: `P(prev>10%)=${n.exceedanceProbability.toFixed(2)}`,
  }))

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            3. Data Assimilation & Current Epidemic State
          </h1>
          <p className="text-muted-foreground text-sm">
            Spatial SEIR IBM parameterized via ABC-SMC. Posterior inference on β, dispersal α,
            latent period, and vector efficiency.
          </p>
        </div>
        <Badge variant="outline">
          <Activity size={14} className="mr-1.5" /> ABC-SMC
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical size={14} /> Assimilation settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Dispersal kernel</label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={kernel}
                onChange={(e) => setKernel(e.target.value as "exponential" | "power_law" | "levy")}
              >
                <option value="exponential">Exponential</option>
                <option value="power_law">Power-law</option>
                <option value="levy">Lévy</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Generations</label>
              <Input
                type="number"
                value={generations}
                onChange={(e) => setGenerations(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Particles / gen</label>
              <Input
                type="number"
                value={particles}
                onChange={(e) => setParticles(Math.max(50, Number(e.target.value) || 50))}
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => compute()}
            className="mt-2 flex items-center gap-2"
          >
            <RefreshCw size={14} /> Run ABC-SMC assimilation
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-96 flex items-center justify-center rounded-xl bg-muted/50">
          <span className="text-muted-foreground">Running ABC-SMC…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            <Card>
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Current risk & spread map</CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[520px]">
                <MapView
                  center={CENTER}
                  zoom={5}
                  layers={[]}
                  markers={markers}
                  circles={circles}
                />
              </CardContent>
            </Card>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Exceedance P(prev &gt; 10%)</span>
              <span className="h-2 w-6 rounded bg-green-500" /> Low
              <span className="h-2 w-6 rounded bg-yellow-500" /> Med
              <span className="h-2 w-6 rounded bg-red-500" /> High
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert size={14} /> Posterior parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3">
                {result?.parameters.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant="outline">{p.ess > 100 ? "ESS ok" : "low ESS"}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      median {p.posteriorMedian} [{p.ciLower}, {p.ciUpper}]
                    </div>
                    <div className="h-1 w-full bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${Math.min(100, (p.ess / 200)) * 100}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground">ESS {p.ess}</div>
                    <DensityChart
                      title={p.name}
                      prior={p.priorDensity}
                      posterior={p.posteriorDensity}
                      priorRange={[p.priorMin, p.priorMax]}
                      className="mt-2"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 size={14} /> Tolerance schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3">
                {result?.toleranceSchedule.map((t) => (
                  <div key={t.generation} className="flex justify-between text-xs text-muted-foreground">
                    <span>Gen {t.generation}</span>
                    <span>ε={t.epsilon.toFixed(3)} · acc={t.acceptanceRate.toFixed(2)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers size={14} /> Exceedance probability
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="text-xs text-muted-foreground">
                  P(prevalence &gt; 10%) by node. Redder = higher exceedance.
                </div>
                <div className="flex gap-1">
                  {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                    <div
                      key={v}
                      className="h-2 rounded"
                      style={{
                        background: `linear-gradient(90deg, #e5e7eb ${Math.floor(v * 100)}%, #f87171 ${Math.floor(v * 100)}%)`,
                      }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
