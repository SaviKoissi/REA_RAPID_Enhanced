"use client"

import { useEffect, useState, useCallback } from "react"
import { MapPin, Target, SlidersHorizontal, Save, Download, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { MapView } from "@/components/map/map-view"
import { t } from "@/lib/i18n"
import {
  runModule2Surveillance,
  module2OptionsFromRecords,
  haversineKm,
} from "@/lib/epi/module2_surveillance"
import type { FieldRecord } from "@/types"

const CENTER: [number, number] = [9.08, 7.42]
const BOUNDS: [[number, number], [number, number]] = [
  [2.68, 4.0],
  [14.68, 13.9],
]

export default function Module2Page() {
  const [records, setRecords] = useState<FieldRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ReturnType<typeof runModule2Surveillance> | null>(null)
  const [constraints, setConstraints] = useState({
    maxSamples: 40,
    gridResolutionKm: 10,
    travelCostWeight: 0.3,
    sensitivity: 0.9,
    specificity: 0.95,
  })

  const compute = useCallback(() => {
    const opts = module2OptionsFromRecords(records, BOUNDS, constraints)
    setResult(runModule2Surveillance(opts))
  }, [records, constraints])

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

  const selected = result?.selectedCells ?? []
  const markers = selected.map((c) => ({
    position: [c.lat, c.lon] as [number, number],
    label: `${c.id} · P(detect)=${c.detectionProbability.toFixed(2)}`,
  }))

  const handleExport = (fmt: "geojson" | "csv") => {
    if (!result) return
    const content = fmt === "geojson" ? result.exportGeoJson : result.exportCsv
    const blob = new Blob([content], {
      type: fmt === "geojson" ? "application/geo+json" : "text/csv",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `rapid_wave_delimitation_${Date.now()}.${fmt === "geojson" ? "geojson" : "csv"}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            2. Optimal Delimitation Surveillance Design
          </h1>
          <p className="text-muted-foreground text-sm">
            Resource-constrained spatial sampling optimization (PLOS ONE 10.1371/journal.pone.0304656).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("geojson")}>
            <Download size={14} className="mr-1.5" /> GeoJSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
            <Download size={14} className="mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <SlidersHorizontal size={14} /> Resource constraints
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Max samples (N_max)</label>
              <Input
                type="number"
                value={constraints.maxSamples}
                onChange={(e) =>
                  setConstraints((c) => ({ ...c, maxSamples: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Grid resolution (km)</label>
              <Input
                type="number"
                value={constraints.gridResolutionKm}
                onChange={(e) =>
                  setConstraints((c) => ({
                    ...c,
                    gridResolutionKm: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Travel cost weight</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={constraints.travelCostWeight}
                onChange={(e) =>
                  setConstraints((c) => ({
                    ...c,
                    travelCostWeight: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Sensitivity (Se)</label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={constraints.sensitivity}
                onChange={(e) =>
                  setConstraints((c) => ({
                    ...c,
                    sensitivity: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Specificity (Sp)</label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={constraints.specificity}
                onChange={(e) =>
                  setConstraints((c) => ({
                    ...c,
                    specificity: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => compute()}
            className="mt-2 flex items-center gap-2"
          >
            <RefreshCw size={14} /> Recompute optimal design
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-96 flex items-center justify-center rounded-xl bg-muted/50">
          <span className="text-muted-foreground">Computing optimal design…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            <Card>
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Detection probability & priority heatmap</CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[520px]">
                <MapView center={CENTER} zoom={5} layers={[]} markers={markers} />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target size={14} /> Design summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Cells selected</span>
                      <span className="font-mono font-medium">{result.selectedCells.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total detection probability</span>
                      <span className="font-mono font-medium">{result.totalDetectionProbability}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Expected detections</span>
                      <span className="font-mono font-medium">{result.expectedDetections}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Grid cells evaluated</span>
                      <span className="font-mono font-medium">{result.grid.length}</span>
                    </div>
                    <Separator />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Selected cells highlighted on the map.</div>
                      <div>Priority = detection prob − travel-cost weight.</div>
                      <div>Unsampled cells near positives + high host density rank highest.</div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">No design computed yet.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Selected sampling coordinates</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {selected.slice(0, 15).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs text-muted-foreground border-b pb-1">
                    <div className="font-mono">{c.id}</div>
                    <div className="font-mono text-right">
                      {c.lat.toFixed(3)}, {c.lon.toFixed(3)}
                    </div>
                  </div>
                ))}
                {selected.length > 15 && (
                  <div className="text-xs text-muted-foreground text-center">
                    …and {selected.length - 15} more (use export for full list)
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
