"use client"

import Link from "next/link"
import { MapPreview } from "@/components/map/map-preview"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { MoreHorizontal } from "lucide-react"
import type { DashboardEntry } from "@/types"
import { t } from "@/lib/i18n"
import { formatDistanceToNowStrict } from "date-fns"

export interface DashboardCardProps {
  dashboard: DashboardEntry
  lang: "en" | "fr"
}

export function DashboardCard({ dashboard, lang }: DashboardCardProps) {
  const { metadata, permissions, modelState, updatedAt } = dashboard
  const { phase } = metadata
  const phaseLabel = `${phase}. ${metadata.name}`

  return (
    <Link href={`/dashboards/${dashboard.key}`} className="group block">
      <Card className="overflow-hidden hover:border-primary transition-colors border">
        <CardHeader className="p-0">
          <CardContent className="pt-0 h-48 overflow-hidden relative">
            <div className="absolute inset-0 bg-muted/40" />
            <MapPreview
              center={(modelState.viewport.center ?? [-1.5, -20]) as [number, number]}
              zoom={modelState.viewport.zoom ?? 4}
              className="h-full w-full opacity-80 group-hover:opacity-100 transition-opacity"
            />
            <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-wider text-primary bg-white/90 px-2 py-0.5 rounded shadow-sm uppercase">
                {phaseLabel}
              </span>
              <Badge variant="secondary">{t(lang, metadata.pathosystem === "CBSD" ? "cbsd" : "bbtd")}</Badge>
            </div>
          </CardContent>
        </CardHeader>
        <CardFooter className="p-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{metadata.name}</span>
              <p className="text-xs text-muted-foreground line-clamp-1">{metadata.description}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
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
