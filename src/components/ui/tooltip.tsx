"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <div className="absolute z-50 mt-1 px-2 py-1 rounded-medium border border-input bg-background text-xs text-foreground shadow-sm opacity-90 animate-in fade-in zoom-in duration-200 pointer-events-none">
          {content}
        </div>
      )}
    </div>
  )
}
