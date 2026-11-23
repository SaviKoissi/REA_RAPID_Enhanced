"use client"

import { useEffect, useState } from "react"
import { DashboardGrid } from "@/components/dashboards/dashboard-grid"
import { ThemeToggle } from "@/components/theme-toggle"
import type { Language } from "@/lib/i18n"
import type { DashboardEntry } from "@/types"

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<DashboardEntry[]>([])
  const [lang, setLang] = useState<Language>("en")

  useEffect(() => {
    fetch("/api/dashboards")
      .then((r) => r.json())
      .then((data: DashboardEntry[]) => setDashboards(data))
  }, [])

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboards</h1>
          <p className="text-muted-foreground text-sm">Analytical views and map cards for your pathosystem.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang((prev) => (prev === "en" ? "fr" : "en"))}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted"
          >
            {lang.toUpperCase()}
          </button>
          <ThemeToggle />
        </div>
      </div>
      <DashboardGrid dashboards={dashboards} lang={lang} onCreate={() => {}} />
    </div>
  )
}
