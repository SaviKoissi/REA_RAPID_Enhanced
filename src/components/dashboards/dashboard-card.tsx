"use client"

import Link from "next/link"
import { MapPreview } from "@/components/map/map-preview"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import type { DashboardEntry } from "@/types"
import { t } from "@/lib/i18n"
import { formatDistanceToNowStrict } from "date-fns"

export interface DashboardCardProps {
  dashboard: DashboardEntry
  lang: "en" | "fr"
}

export function DashboardCard({ dashboard, lang }: DashboardCardProps) {
  const { metadata, modelState, updatedAt } = dashboard
  const { phase } = metadata
  const phaseLabel = `${phase}. ${metadata.name}`

  const markers: Array<{ position: [number, number]; label?: string }> = []
  for (const layer of dashboard.layers ?? []) {
    const geo = (
      layer as unknown as {
        data?: {
          features?: Array<{
            geometry?: { coordinates?: [number, number] }
            properties?: { sample_id?: string; status?: string }
          }>
        }
      }
    ).data
    if (geo?.features) {
      for (const f of geo.features.slice(0, 12)) {
        const coords = f.geometry?.coordinates
        if (Array.isArray(coords) && coords.length >= 2) {
          markers.push({
            position: [coords[1], coords[0]],
            label: `${f.properties?.sample_id ?? "Site"} (${f.properties?.status ?? ""})`,
          })
        }
      }
    }
  }

  return (
    <Link href={`/dashboards/${dashboard.key}`} className="group block">
      <Card className="overflow-hidden hover:border-primary transition-colors border">
        <CardHeader className="p-0">
          <CardContent className="pt-0 h-48 overflow-hidden relative">
            <div className="absolute inset-0 bg-muted/40" />
            <MapPreview
              center={(modelState.viewport.center ?? [7.8, 8.6]) as [number, number]}
              zoom={modelState.viewport.zoom ?? 6}
              markers={markers}
              className="h-full w-full opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-wider text-primary bg-white/90 px-2 py-0.5 rounded shadow-sm uppercase">
                {phaseLabel}
              </span>
              <Badge variant="secondary">{t(lang, metadata.pathosystem === "CBSD" ? "cbsd" : "bbtd")}</Badge>
            </div>
          </CardContent>
        </CardHeader>
        <CardFooter className="p-3 pt-2 w-full">
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-medium truncate">{metadata.name}</span>
              <p className="text-xs text-muted-foreground line-clamp-1">{metadata.description}</p>
            </div>
            <div className="flex items-center gap-2 text-xs shrink-0">
              <Badge variant="outline">{t(lang, "statusActive")}</Badge>
              <span className="text-muted-foreground">
                {t(lang, "updated")} {formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true })} ago
              </span>
            </div>
          </div>
        </CardFooter>
      </Card>
    </Link>
  )
}
