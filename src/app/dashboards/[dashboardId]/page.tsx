"use client"

import { useMemo, useState, useEffect } from "react"
import nextDynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { runABCSMC, computeUncertaintyMap, compareScenarios } from "@/lib/epi/engine"
import type {
  MapViewProps,
} from "@/components/map/map-view"
import type {
  DashboardEntry,
  ABCSMCResult,
  UncertaintyMap,
  ScenarioComparison,
  FieldRecord,
} from "@/types"
import { useParams } from "next/navigation"
import { BarChart3, ShieldAlert, Layers, Play, MapPin } from "lucide-react"

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


export const dynamic = "force-dynamic"

const MapView = nextDynamic<MapViewProps>(() => import("@/components/map/map-view"), { ssr: false })

const POINTS = [
  { x: -1.2, y: -19.5, value: 0.7 },
  { x: -2.0, y: -21.0, value: 0.4 },
  { x: -0.8, y: -22.5, value: 0.85 },
  { x: -2.5, y: -18.0, value: 0.2 },
]

const ABC_RESULT: ABCSMCResult = runABCSMC({
  parameterNames: ["beta", "gamma", "rho"],
  priors: [
    { min: 0.01, max: 0.5 },
    { min: 0.01, max: 0.5 },
    { min: 0, max: 1 },
  ],
  simulate: (p) => [p[0] * 100, p[1] * 80, p[2] * 50],
  observed: [12, 9, 40],
  distance: (sim, obs) => Math.sqrt(sim.reduce((a, v, i) => a + (v - obs[i]) ** 2, 0)),
  generations: 6,
  particlesPerGen: 400,
  seed: 42,
})

const SCEN: ScenarioComparison = compareScenarios([
  { id: "scen_no_control", name: "No intervention", metricValues: { infected: 1200, spread_km2: 450, cost: 0 } },
  { id: "scen_controls", name: "Management interventions", metricValues: { infected: 410, spread_km2: 130, cost: 85000 } },
])

const buildDemo = (dashboardId: string): DashboardEntry => ({
  key: dashboardId || `dashboard_demo_${safeUUID()}`,
  metadata: {
    name: "CBSD risk map",
    description:
      "Spatial risk surface for Cassava Brown Streak Disease with ABC-SMC posterior and uncertainty cartography.",
    pathosystem: "CBSD",
    language: "en",
    phase: 3,
  },
  permissions: {
    orgId: "org_wave_001",
    permissionType: "org",
    permissionLevel: "owner",
    userId: "user_admin_001",
  },
  layers: [
    { id: "host_crop", type: "raster", name: "Host crop raster", url: "/rasters/host_crop.tif", visible: true, opacity: 0.6 },
    { id: "surveys", type: "vector", name: "Delimitation surveys", visible: true, opacity: 0.9 },
  ],
  modelState: {
    viewport: { center: [-1.5, -20], zoom: 5 },
    activeLayers: ["host_crop", "surveys"],
    posteriors: [
      { id: "post_1", method: "ABC-SMC", artifactUrl: "/artifacts/posterior_1.json", createdAt: new Date().toISOString() },
    ],
    uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.95 },
    scenarioComparison: { enabled: true, scenarioIds: ["scen_no_control", "scen_controls"] },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ownerId: "user_admin_001",
  orgId: "org_wave_001",
})

export default function DashboardDetailPage() {
  const params = useParams()
  const [lang, setLang] = useState<"en" | "fr">("en")
  const [markers, setMarkers] = useState<Array<{ position: [number, number]; label?: string }>>([])
  const dashboard = useMemo(() => buildDemo((params.dashboardId as string) || ""), [params.dashboardId])
  const UNC: UncertaintyMap = useMemo(
    () => computeUncertaintyMap(POINTS, { bounds: [[-3, -24], [0, -16]], resolution: 40, method: "kriging", confidence: 0.95 }),
    []
  )

  useEffect(() => {
    let cancelled = false
    fetch(`/api/observatory?orgId=${encodeURIComponent((dashboard as any).orgId ?? (dashboard as any).permissions?.orgId ?? "org_wave_001")}`)
      .then(async (r) => { const txt = await r.text(); if (!txt) return []; try { return JSON.parse(txt); } catch { return []; } })
      .then((data: FieldRecord[]) => {
        if (cancelled) return
        setMarkers(
          data.map((o) => ({
            position: [o.latitude, o.longitude],
            label: `${o.sample_id} · ${o.diagnostic_status}`,
          }))
        )
      })
    return () => {
      cancelled = true
    }
  }, [dashboard.orgId])

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{dashboard.metadata.name}</h1>
          <p className="text-muted-foreground text-sm">{dashboard.metadata.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {t(lang, dashboard.metadata.pathosystem === "CBSD" ? "cbsd" : "bbtd")}
          </Badge>
          <Badge variant="secondary">Phase {dashboard.metadata.phase}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between p-0">
              <div>
                <CardTitle className="text-sm">Live map</CardTitle>
                <p className="text-xs text-muted-foreground">Viewport + active layers</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={dashboard.modelState.uncertaintyCartography?.enabled ? "default" : "outline"}>
                  {t(lang, "uncertaintyCartography")}
                </Badge>
                <Badge variant={dashboard.modelState.scenarioComparison?.enabled ? "default" : "outline"}>
                  {t(lang, "scenarioComparison")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 h-[520px]">
              <MapView center={dashboard.modelState.viewport.center} zoom={dashboard.modelState.viewport.zoom} layers={dashboard.layers} markers={markers} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 size={14} /> {t(lang, "abcSmc")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-muted p-2 rounded">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Acceptance rate</div>
                  <div className="font-mono">{((ABC_RESULT.acceptanceRate ?? 0) * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Generations</div>
                  <div className="font-mono">{ABC_RESULT.generations ?? 0}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Final tolerance</div>
                  <div className="font-mono">{ABC_RESULT.tolerance?.toFixed(3) ?? 0}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Posterior samples drawn: {ABC_RESULT.posteriorSamples.length} across{" "}
                {ABC_RESULT.parameterNames.join(", ")}.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert size={14} /> {t(lang, "uncertaintyCartography")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                Method: {UNC.method}<br />
                Confidence:
                {(dashboard.modelState.uncertaintyCartography?.confidence ?? 0.95) * 100}%
              </div>
              <div className="h-32 bg-muted rounded border" />
              <Button variant="outline" size="sm" onClick={() => {}}>
                <Play size={14} /> Recompute (IDW)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers size={14} /> {t(lang, "scenarioComparison")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                Scenarios compared: {SCEN.scenarioIds.length}
              </div>
              <div className="space-y-1">
                {Object.entries(SCEN.metrics).map(([metric, values]) => (
                  <div key={metric} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{metric}</span>
                    <span className="font-mono">
                      {(values as number[]).map((v: number) => v.toLocaleString()).join(" \u2192 ")}
                    </span>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm">
                <MapPin size={14} /> Compare on map
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
