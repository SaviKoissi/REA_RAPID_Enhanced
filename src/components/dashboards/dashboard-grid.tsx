"use client"

import { Search, Plus, LayoutDashboard } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardCard } from "./dashboard-card"
import type { DashboardEntry } from "@/types"
import { t } from "@/lib/i18n"
import { useState } from "react"

export interface DashboardGridProps {
  dashboards: DashboardEntry[]
  lang: "en" | "fr"
  onCreate: () => void
}

export function DashboardGrid({ dashboards, lang, onCreate }: DashboardGridProps) {
  const [query, setQuery] = useState("")

  const filtered = dashboards.filter((d) =>
    d.metadata.name.toLowerCase().includes(query.toLowerCase()) ||
    d.metadata.description.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative w-full md:w-72 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t(lang, "searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={onCreate} className="flex items-center gap-2">
            <Plus size={18} /> {t(lang, "createDashboard")}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LayoutDashboard size={14} /> {filtered.length}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <CardContent className="p-0">
            <div className="flex flex-col items-center gap-2">
              <p className="text-muted-foreground">{t(lang, "noDashboards")}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <DashboardCard key={d.key} dashboard={d} lang={lang} />
          ))}
        </div>
      )}
    </div>
  )
}
