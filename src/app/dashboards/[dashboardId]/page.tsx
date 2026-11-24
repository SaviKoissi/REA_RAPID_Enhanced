"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import nextDynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import type {
  MapViewProps,
} from "@/components/map/map-view"
import type {
  DashboardEntry,
  FieldRecord,
} from "@/types"
import { useParams } from "next/navigation"
import { BarChart3, ShieldAlert, Layers, Play, MapPin, RefreshCw } from "lucide-react"

const MapView = nextDynamic<MapViewProps>(() => import("@/components/map/map-view"), {
  loading: () => (
    <div className="h-[520px] w-full rounded-lg border border-input bg-muted/50 flex items-center justify-center text-xs text-muted-foreground">
      Loading map…
    </div>
  ),
  ssr: false,
})

function safeCenter(c: MapViewProps["center"] | undefined): [number, number] {
  if (c && Array.isArray(c) && c.length === 2 && typeof c[0] === "number" && typeof c[1] === "number") {
    return c as [number, number]
  }
  return [7.8, 9.0]
}

export const dynamic = "force-dynamic"

export default function DashboardDetailPage() {
  const params = useParams()
  const key = (params.dashboardId as string) || ""
  const [dashboard, setDashboard] = useState<DashboardEntry | null>(null)
  const [markers, setMarkers] = useState<Array<{ position: [number, number]; label?: string }>>([])
  const [lang, setLang] = useState<"en" | "fr">("en")
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(() => {
    if (!key) return
    let cancelled = false
    const resolvedKey = key.startsWith("dashboard_") ? key : `dashboard_${key}`
    fetch(`/api/dashboards/${encodeURIComponent(resolvedKey)}`)
      .then(async (r) => {
        const txt = await r.text()
        if (!r.ok || !txt) throw new Error(`HTTP ${r.status}`)
        try {
          return JSON.parse(txt)
        } catch {
          throw new Error("Invalid dashboard JSON")
        }
      })
      .then((data: DashboardEntry) => {
        if (cancelled) return
        setDashboard(data)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load dashboard")
      })
    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    const unsub = fetchDashboard()
    return () => unsub?.()
  }, [fetchDashboard])

  const orgId = useMemo(() => {
    return dashboard?.permissions?.orgId ?? dashboard?.orgId ?? "org_wave_001"
  }, [dashboard])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    fetch(`/api/observatory?orgId=${encodeURIComponent(orgId)}`)
      .then(async (r) => {
        const txt = await r.text()
        if (!txt) return []
        try {
          return JSON.parse(txt)
        } catch {
          return []
        }
      })
      .then((data: FieldRecord[]) => {
        if (cancelled) return
        setMarkers(
          data.map((o) => ({
            position: [o.latitude, o.longitude],
            label: `${o.sample_id} · ${o.diagnostic_status}`,
          }))
        )
      })
      .catch(() => {
        // markers stay empty on observatory fetch failure; not fatal
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const viewport = dashboard?.modelState.viewport
  const center = safeCenter(viewport?.center)
  const zoom = typeof viewport?.zoom === "number" ? viewport.zoom : 6
  const layers = dashboard?.layers ?? []
  const posteriors = dashboard?.modelState.posteriors ?? []
  const uncertainty = dashboard?.modelState.uncertaintyCartography
  const scenario = dashboard?.modelState.scenarioComparison

  const pathosystemLabel = t(lang, dashboard?.metadata.pathosystem === "CBSD" ? "cbsd" : "bbtd")

  return (
    <div className="px-6 py-8 space-y-6">
      {error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-destructive/20 bg-destructive/5">
          <h2 className="text-lg font-semibold text-destructive">Dashboard not found</h2>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/dashboards"}>
            Return to dashboards
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{dashboard?.metadata.name ?? "Loading dashboard…"}</h1>
              <p className="text-muted-foreground text-sm">{dashboard?.metadata.description ?? ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLang((l) => (l === "en" ? "fr" : "en"))}
              >
                {lang.toUpperCase()}
              </Button>
              <Badge variant="outline">{pathosystemLabel}</Badge>
              <Badge variant="secondary">Phase {dashboard?.metadata.phase ?? "—"}</Badge>
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
                    <Badge variant={uncertainty?.enabled ? "default" : "outline"}>
                      {t(lang, "uncertaintyCartography")}
                    </Badge>
                    <Badge variant={scenario?.enabled ? "default" : "outline"}>
                      {t(lang, "scenarioComparison")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 h-[520px]">
                  {dashboard ? (
                    <MapView center={center} zoom={zoom} layers={layers} markers={markers} />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                      Loading map…
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 size={14} /> {t(lang, "abcSmc")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  {posteriors.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="bg-muted p-2 rounded">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Posteriors
                        </div>
                        <div className="font-mono">{posteriors.length}</div>
                      </div>
                      <div className="bg-muted p-2 rounded">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Method
                        </div>
                        <div className="font-mono">{posteriors[0]?.method ?? "ABC-SMC"}</div>
                      </div>
                      <div className="bg-muted p-2 rounded">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Artifact
                        </div>
                        <div className="font-mono truncate">{posteriors[0]?.artifactUrl ?? "—"}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No ABC-SMC posterior attached to this view.
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {}}
                    className="w-auto"
                  >
                    <RefreshCw size={14} /> Recompute
                  </Button>
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
                    <div>
                      Method: {uncertainty?.method ?? "kriging"}
                    </div>
                    <div>
                      Confidence: {(uncertainty?.confidence ?? 0.95) * 100}%
                    </div>
                    <div>
                      Enabled: {uncertainty?.enabled ? "Yes" : "No"}
                    </div>
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
                    <div>Enabled: {scenario?.enabled ? "Yes" : "No"}</div>
                    <div>Scenarios: {scenario?.scenarioIds?.length ?? 0}</div>
                  </div>
                  <Button variant="outline" size="sm">
                    <MapPin size={14} /> Compare on map
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Observatory markers</CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-2 max-h-64 overflow-y-auto">
                  {markers.length > 0 ? (
                    markers.map((m) => (
                      <div
                        key={m.label ?? m.position.join(",")}
                        className="flex items-center justify-between text-xs text-muted-foreground border-b pb-1 last:border-0"
                      >
                        <div className="font-mono">{m.label}</div>
                        <div className="font-mono text-right">
                          {m.position[0].toFixed(3)}, {m.position[1].toFixed(3)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No survey points for this organisation.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
