"use client"

import { useEffect, useState } from "react"
import { MapPin, AlertCircle, CheckCircle2, TrendingUp, Layers, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MapView } from "@/components/map/map-view"
import { t } from "@/lib/i18n"
import { runModule1Detection, alertLevelColor, alertLevelBadge, deriveHostClustersFromPoints } from "@/lib/epi/module1_detection"
import type { FieldRecord } from "@/types"
import type { HostCluster } from "@/types"

const CENTER: [number, number] = [9.08, 7.42] // Nigeria centroid

function fieldToSurveyPoint(f: FieldRecord): { id: string; lat: number; lon: number; positive: boolean; date: string; sampleId: string; hostCrop: import("@/types").HostCrop } {
  return {
    id: f.sample_id,
    lat: f.latitude,
    lon: f.longitude,
    positive: f.diagnostic_status === "Infectious" || f.diagnostic_status === "Exposed",
    date: f.date,
    sampleId: f.sample_id,
    hostCrop: f.host_crop,
  }
}

export default function Module1Page() {
  const [records, setRecords] = useState<FieldRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [hostRasterUrl, setHostRasterUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetch("/api/observatory?orgId=org_wave_001")
      .then((r) => r.json())
      .then((data: FieldRecord[]) => {
        if (cancelled) return
        setRecords(data)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Try to load the SPAM host-layer manifest for this region if present.
    fetch("/data/host_layers/manifest.json")
      .then((r) => r.json())
      .then((m: { output_geotiff: string | null }) => {
        if (m.output_geotiff) setHostRasterUrl(m.output_geotiff)
      })
      .catch(() => {
        // No manifest yet; raster layer stays optional.
      })
  }, [])

  const surveyPoints = records.map(fieldToSurveyPoint)
  const clusters = deriveHostClustersFromPoints(surveyPoints)
  const output = runModule1Detection({
    points: surveyPoints,
    hostClusters: clusters,
    hostRasterUrl,
    adminBoundsUrl: "/boundaries/nigeria_admin.geojson",
  })

  const { metrics, mapLayers } = output
  const allMarkers = [
    ...mapLayers.positiveMarkers.map((m) => ({ ...m, color: "text-destructive" as const })),
    ...mapLayers.negativeMarkers,
    ...mapLayers.hostClusters.map((c) => ({
      position: c.centroid,
      label: `${c.name} (${c.hostDensity} pts)`,
      color: "text-muted-foreground" as const,
    })),
  ]

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">1. Initial Detection & Situational Awareness</h1>
          <p className="text-muted-foreground text-sm">
            Triggered by confirmed positive field reports and lab diagnostics. Host-density baseline from SPAM (s41597-020-0501-z).
          </p>
        </div>
        <Badge className={alertLevelBadge(metrics.alertLevel)}>
          <AlertCircle size={14} className="mr-1.5" /> {metrics.alertLevel.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp size={14} /> Detection velocity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-bold">{metrics.detectionVelocity}</div>
            <div className="text-xs text-muted-foreground">confirmed positives / day</div>
            <div className="text-xs text-muted-foreground mt-1">{metrics.daysSinceIndex} days since index case</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin size={14} /> Index case
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.indexCase ? (
              <div className="text-sm">
                <div className="font-medium">{metrics.indexCase.sampleId}</div>
                <div className="text-xs text-muted-foreground">{metrics.indexCase.hostCrop}</div>
                <div className="text-xs text-muted-foreground">
                  [{metrics.indexCase.lat.toFixed(3)}, {metrics.indexCase.lon.toFixed(3)}]
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No confirmed index case</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers size={14} /> Nearest host cluster
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.nearestHostCluster ? (
              <div className="text-sm">
                <div className="font-medium">{metrics.nearestHostCluster.name}</div>
                <div className="text-xs text-muted-foreground">
                  {metrics.distanceToNearestHostClusterKm >= 0
                    ? metrics.distanceToNearestHostClusterKm.toFixed(1) + " km"
                    : "n/a"}
                </div>
                <div className="text-xs text-muted-foreground">density {metrics.nearestHostCluster.hostDensity} pts</div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No host cluster defined</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <Card>
            <CardHeader className="p-0">
              <CardTitle className="text-sm">Survey map — positive / negative points</CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[520px]">
              <MapView center={CENTER} zoom={5} layers={[]} markers={allMarkers} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info size={14} /> Situation summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total survey points</span>
                <span className="font-medium">{metrics.totalPoints}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confirmed positive</span>
                <span className={`font-medium ${alertLevelColor(metrics.alertLevel)}`}>
                  {metrics.positiveCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Negative</span>
                <span className="font-medium">{metrics.negativeCount}</span>
              </div>
              <Separator />
              <div className="text-xs text-muted-foreground">
                Positive points pin in red; negative in green. Host clusters derived from SPAM host-density grid binning.
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => {}}>
                <CheckCircle2 size={14} className="mr-1.5" /> Confirm index case
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Host layers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>SPAM host-density raster</span>
                <Badge variant={hostRasterUrl ? "default" : "secondary"}>
                  {hostRasterUrl ? "loaded" : "pending"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Admin boundaries</span>
                <Badge variant="outline">reference</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
