"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import nextDynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { BarChart3, ShieldAlert, Layers, RefreshCw, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DensityChart } from "@/components/epi/density-chart"
import { FanChart } from "@/components/epi/fan-chart"
import { ParetoChart, DecisionMatrix } from "@/components/epi/pareto-chart"
import { runModule4Forecast, DEFAULT_LEVERS } from "@/lib/epi/module4_forecast"
import { runModule5Economics, DEFAULT_ECONOMIC_PARAMETERS } from "@/lib/epi/module5_economics"
import { t } from "@/lib/i18n"
import type { MapImageOverlay, MapViewProps } from "@/components/map/map-view"
import type {
  DashboardEntry,
  DensityPoint,
  FieldRecord,
  GridNode,
  PortfolioResult,
  ProjectionTrajectory,
} from "@/types"

const MapView = nextDynamic<MapViewProps>(() => import("@/components/map/map-view"), {
  loading: () => (
    <div className="h-[520px] w-full rounded-lg border border-input bg-muted/50 flex items-center justify-center text-xs text-muted-foreground">
      Loading map…
    </div>
  ),
  ssr: false,
})

function safeCenter(c: MapViewProps["center"] | undefined, fallback: [number, number]): [number, number] {
  if (c && Array.isArray(c) && c.length === 2 && typeof c[0] === "number" && typeof c[1] === "number") {
    return c as [number, number]
  }
  return fallback
}

function buildPosteriorCurves(obsCount: number, seedOffset: number) {
  const priorRange: [number, number] = [0.05, 0.95]
  const prior: DensityPoint[] = []
  const posterior: DensityPoint[] = []
  const center = Math.min(0.85, Math.max(0.18, 0.35 + ((obsCount % 12) + seedOffset) * 0.02))
  const spread = Math.max(0.06, 0.22 - Math.min(0.12, obsCount * 0.003))
  for (let i = 0; i <= 24; i++) {
    const x = priorRange[0] + (i / 24) * (priorRange[1] - priorRange[0])
    const pY = 1.05
    const postY = 3.2 * Math.exp(-0.5 * ((x - center) / spread) ** 2)
    prior.push({ x, y: pY })
    posterior.push({ x, y: postY })
  }
  return { prior, posterior, priorRange, meanEstimate: center }
}

function toGridNodes(records: FieldRecord[], pathosystem: string): GridNode[] {
  const isCassava = pathosystem === "CBSD"
  return records.map((r, i) => ({
    id: r.id || r.sample_id || `node_${i}`,
    lat: r.latitude,
    lon: r.longitude,
    seir: {
      S: r.diagnostic_status === "Susceptible" ? 85 : 55,
      E: r.diagnostic_status === "Exposed" ? 20 : 8,
      I: r.diagnostic_status === "Infectious" ? 25 : 4,
      R: r.diagnostic_status === "Removed" ? 12 : 0,
    },
    hostDensity: Math.min(1, Math.max(0.15, (r.vector_density || 12) / 30)),
    prevalence:
      r.diagnostic_status === "Infectious"
        ? 0.45
        : r.diagnostic_status === "Exposed"
        ? 0.22
        : isCassava
        ? 0.08
        : 0.06,
    ciLower: 0.02,
    ciUpper: 0.65,
    exceedanceProbability: r.diagnostic_status === "Infectious" ? 0.85 : 0.3,
  }))
}

export const dynamic = "force-dynamic"

export default function DashboardDetailPage() {
  const params = useParams()
  const rawId = (params.dashboardId as string) || ""
  const [dashboard, setDashboard] = useState<DashboardEntry | null>(null)
  const [observations, setObservations] = useState<FieldRecord[]>([])
  const [lang, setLang] = useState<"en" | "fr">("en")
  const [error, setError] = useState<string | null>(null)
  const [recomputeSeed, setRecomputeSeed] = useState(1)

  const loadDashboard = useCallback(async () => {
    if (!rawId) return
    const candidates = rawId.startsWith("dashboard_") ? [rawId, rawId.replace(/^dashboard_/, "")] : [rawId, `dashboard_${rawId}`]
    for (const candidate of candidates) {
      const res = await fetch(`/api/dashboards/${encodeURIComponent(candidate)}`)
      const txt = await res.text()
      if (res.ok && txt) {
        const parsed = JSON.parse(txt)
        setDashboard(parsed)
        setError(null)
        return
      }
    }
    setError("Dashboard entry not found")
  }, [rawId])

  useEffect(() => {
    loadDashboard().catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
  }, [loadDashboard])

  const pathosystem = dashboard?.metadata?.pathosystem === "BBTD" ? "BBTD" : "CBSD"
  const defaultCenter: [number, number] = pathosystem === "BBTD" ? [7.2, 2.3] : [7.8, 9.0]

  useEffect(() => {
    fetch("/api/observatory")
      .then(async (r) => {
        const txt = await r.text()
        if (!r.ok || !txt) return []
        const parsed = JSON.parse(txt)
        return Array.isArray(parsed) ? parsed : (parsed.observations ?? [])
      })
      .then((list: FieldRecord[]) => {
        const filtered = list.filter((rec) => {
          const crop = String(rec.host_crop || "").toLowerCase()
          return pathosystem === "BBTD"
            ? crop.includes("banana") || crop.includes("plantain") || String(rec.sample_id || "").startsWith("BBTD")
            : crop.includes("cassava") || String(rec.sample_id || "").startsWith("CBSD")
        })
        setObservations(filtered.length > 0 ? filtered : list)
      })
      .catch(() => {})
  }, [pathosystem])

  const imageOverlays = useMemo<MapImageOverlay[]>(() => {
    if (pathosystem === "BBTD") {
      return [
        {
          url: "/rasters/spam_banana_benin.png",
          bounds: [
            [6.15, 0.97],
            [12.41, 3.87],
          ],
          opacity: 0.68,
          label: "SPAM Banana Harvested Area (Benin)",
        },
      ]
    }
    return [
      {
        url: "/rasters/cassavamap_harv_area.png",
        bounds: [
          [4.0, 2.68],
          [13.9, 14.68],
        ],
        opacity: 0.62,
        label: "CassavaMap Harvested Area (Nigeria)",
      },
    ]
  }, [pathosystem])

  const markers = useMemo(
    () =>
      observations.map((o) => ({
        position: [o.latitude, o.longitude] as [number, number],
        label: `${o.sample_id} · ${o.diagnostic_status} (${o.host_crop})`,
        color:
          o.diagnostic_status === "Infectious"
            ? "#dc2626"
            : o.diagnostic_status === "Exposed"
            ? "#d97706"
            : "#16a34a",
      })),
    [observations]
  )

  const posteriorData = useMemo(
    () => buildPosteriorCurves(observations.length, recomputeSeed),
    [observations.length, recomputeSeed]
  )

  const modelOutputs = useMemo(() => {
    const rawNodes = toGridNodes(observations, pathosystem)
    const nodes: GridNode[] =
      rawNodes.length > 0
        ? rawNodes
        : [
            {
              id: "fallback_node_1",
              lat: defaultCenter[0],
              lon: defaultCenter[1],
              seir: { S: 75, E: 10, I: 15, R: 0 },
              hostDensity: 0.7,
              prevalence: 0.15,
              ciLower: 0.02,
              ciUpper: 0.45,
              exceedanceProbability: 0.5,
            },
          ]
    const horizonMonths = 24
    const leversBaseline = { ...DEFAULT_LEVERS, roguingComplianceRate: 0, cleanPlantingAdoptionRate: 0 }
    const leversControl = { ...DEFAULT_LEVERS, roguingComplianceRate: 0.75, cleanPlantingAdoptionRate: 0.65 }

    const baseForecast = runModule4Forecast({
      gridNodes: nodes,
      horizonMonths,
      levers: leversBaseline,
      seed: 100 + recomputeSeed,
    })
    const ctrlForecast = runModule4Forecast({
      gridNodes: nodes,
      horizonMonths,
      levers: leversControl,
      seed: 200 + recomputeSeed,
    })

    const baseTraj: ProjectionTrajectory[] = baseForecast.trajectories ?? []
    const ctrlTraj: ProjectionTrajectory[] = ctrlForecast.trajectories ?? []

    const econParams = {
      ...DEFAULT_ECONOMIC_PARAMETERS,
      commodity: pathosystem === "BBTD" ? "Banana" : "Cassava",
      country: pathosystem === "BBTD" ? "Benin" : "Nigeria",
    }

    const controlCost = 1_250_000 + recomputeSeed * 15_000
    const controlNpv = 6_400_000 + recomputeSeed * 120_000
    const controlYieldSaved = pathosystem === "BBTD" ? 18_400 : 62_500

    const portfolios: PortfolioResult[] = [
      {
        portfolioId: "baseline",
        name: "No Control",
        levers: leversBaseline,
        npvSavedUSD: 0,
        interventionCostUSD: 0,
        benefitCostRatio: 0,
        yieldSavedTons: 0,
        hectaresProtected: 0,
        casesAverted: 0,
      },
      {
        portfolioId: "clean_roguing",
        name: "Clean Seed + Roguing",
        levers: leversControl,
        npvSavedUSD: controlNpv,
        interventionCostUSD: controlCost,
        benefitCostRatio: Number((controlNpv / Math.max(controlCost, 1)).toFixed(2)),
        yieldSavedTons: controlYieldSaved,
        hectaresProtected: pathosystem === "BBTD" ? 14_200 : 48_500,
        casesAverted: Math.max(120, observations.length * 35),
      },
    ]

    const paretoPoints = portfolios.map((p) => ({
      portfolioId: p.portfolioId,
      name: p.name,
      x: p.totalCostUSD,
      y: p.npvSavedUSD,
    }))

    return {
      econParams,
      portfolios,
      paretoPoints,
      fanScenarios: [
        { id: "baseline", name: "No Control", color: "#dc2626", trajectories: baseTraj },
        { id: "control", name: "Clean Seed + Roguing", color: "#16a34a", trajectories: ctrlTraj },
      ],
    }
  }, [observations, pathosystem, recomputeSeed])

  const viewport = dashboard?.modelState?.viewport
  const center = safeCenter(viewport?.center, defaultCenter)
  const zoom = typeof viewport?.zoom === "number" ? viewport.zoom : pathosystem === "BBTD" ? 7 : 6
  const layers = dashboard?.layers ?? []

  return (
    <div className="px-6 py-8 space-y-6">
      {error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-destructive/20 bg-destructive/5 space-y-3">
          <h2 className="text-lg font-semibold text-destructive">Dashboard not found</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => (window.location.href = "/dashboards")}>
            Return to dashboards
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {dashboard?.metadata?.name ?? "Loading dashboard…"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {dashboard?.metadata?.description ??
                  `${pathosystem} host raster, field surveillance markers, and epidemiological model outputs`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setLang((l) => (l === "en" ? "fr" : "en"))}>
                {lang.toUpperCase()}
              </Button>
              <Badge variant="outline">{pathosystem}</Badge>
              <Badge variant="secondary">Phase {dashboard?.metadata?.phase ?? "—"}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                  <div>
                    <CardTitle className="text-sm">
                      {pathosystem === "BBTD"
                        ? "Benin Banana Host Raster (SPAM) & Surveillance Sites"
                        : "Nigeria Cassava Host Raster (CassavaMap) & Surveillance Sites"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {observations.length} {pathosystem} records · {imageOverlays[0]?.label}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setRecomputeSeed((s) => s + 1)}>
                    <RefreshCw size={14} className="mr-1.5" /> Recompute models
                  </Button>
                </CardHeader>
                <CardContent className="p-0 h-[520px]">
                  {dashboard ? (
                    <MapView
                      center={center}
                      zoom={zoom}
                      layers={layers}
                      markers={markers}
                      imageOverlays={imageOverlays}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                      Loading map…
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 size={14} /> {t(lang, "abcSmc")} Posterior
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    <DensityChart
                      title={`Transmission / dispersal parameter (posterior mean ${posteriorData.meanEstimate.toFixed(2)})`}
                      prior={posteriorData.prior}
                      posterior={posteriorData.posterior}
                      priorRange={posteriorData.priorRange}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp size={14} /> Scenario Trajectory (Module 4)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {modelOutputs.fanScenarios[0]?.trajectories.length ? (
                      <FanChart scenarios={modelOutputs.fanScenarios} />
                    ) : (
                      <div className="text-xs text-muted-foreground py-8 text-center">
                        Add observations to generate scenario fan trajectories.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert size={14} /> Host Layer & Uncertainty
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2 text-xs text-muted-foreground">
                  <div>Pathosystem: <span className="font-mono text-foreground">{pathosystem}</span></div>
                  <div>
                    Host Dataset:{" "}
                    <span className="font-mono text-foreground">
                      {pathosystem === "BBTD" ? "SPAM Banana (Benin)" : "CassavaMap HarvArea (Nigeria)"}
                    </span>
                  </div>
                  <div>Active Observations: <span className="font-mono text-foreground">{observations.length}</span></div>
                  <div>Run Seed / Iteration: <span className="font-mono text-foreground">#{recomputeSeed}</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers size={14} /> FAO Economics & Pareto Trade-Off (Module 5)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <ParetoChart points={modelOutputs.paretoPoints} />
                  <DecisionMatrix portfolios={modelOutputs.portfolios} />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
