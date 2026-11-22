"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sun, Moon, Users, Shield, DollarSign, Monitor, Globe, LogOut, AlertTriangle, Target, Activity, TrendingUp, PieChart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"
import { useState } from "react"
import type { User } from "@/types"

const NAV_ITEMS = [
  { key: "dashboards", label: "navDashboards", href: "/dashboards", icon: "Monitor" },
  { key: "surveillance", label: "navSurveillance", href: "/dashboards/module-1", icon: "AlertTriangle" },
  { key: "delimitation", label: "navDelimitation", href: "/dashboards/module-2", icon: "Target" },
  { key: "assimilation", label: "navAssimilation", href: "/dashboards/module-3", icon: "Activity" },
  { key: "forecast", label: "navForecast", href: "/dashboards/module-4", icon: "TrendingUp" },
  { key: "economics", label: "navEconomics", href: "/dashboards/module-5", icon: "PieChart" },
  { key: "files", label: "navFiles", href: "/files", icon: "DollarSign" },
  { key: "organisation", label: "navOrganisation", href: "/organisation", icon: "Users" },
] as const

const ICONS: Record<string, React.ElementType> = {
  Monitor,
  DollarSign,
  Users,
  Shield,
  Globe,
  AlertTriangle,
  Target,
  Activity,
  TrendingUp,
  PieChart,
}

export interface TopNavProps {
  user: User | null
  lang: "en" | "fr"
  setLang: (lang: "en" | "fr") => void
  onSignOut: () => void
  pathosystem?: string
}

export function TopNav({ user, lang, setLang, onSignOut, pathosystem }: TopNavProps) {
  const pathname = usePathname()
  const [langOpen, setLangOpen] = useState(false)

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  return (
    <nav className="sticky top-0 z-40 border-b border-input bg-background/80 backdrop-blur-md">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm"
          >
            <span className="h-5 w-5 rounded bg-primary-foreground text-primary flex items-center justify-center text-xs font-bold">W</span>
            <span className="font-bold tracking-tight">RAPID WAVE</span>
          </Link>
        </div>

        <div className="flex-1 lg:flex lg:items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon]
            const active = isActive(item.href)
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon size={16} /> {t(lang, item.label)}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu open={langOpen} onOpenChange={setLangOpen}>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Globe size={16} className="mr-1" />
                {lang === "en" ? t(lang, "english") : t(lang, "french")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{t(lang, "language")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => { setLang("en"); setLangOpen(false) }}>
                <Sun size={14} className="mr-2" /> {t(lang, "english")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setLang("fr"); setLangOpen(false) }}>
                <Sun size={14} className="mr-2" /> {t(lang, "french")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu open={langOpen} onOpenChange={setLangOpen}>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback>{user?.name?.slice(0, 1)?.toUpperCase() ?? "U"}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">{user?.name}</span>
                <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{t(lang, "userProfile")}</DropdownMenuLabel>
              <DropdownMenuItem>
                <Shield size={14} className="mr-2" /> {user?.role.replace("_", " ").toUpperCase()}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSignOut}>
                <LogOut size={14} className="mr-2" /> {t(lang, "signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}
