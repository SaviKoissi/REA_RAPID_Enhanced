"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: string
  description?: string
}

export function Dialog({ open, onOpenChange, children, title, description }: DialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {open ? (
        <>
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div className="relative w-full max-w-lg">
            <div className="bg-background rounded-xl border border-input shadow-lg p-6 mx-auto transform transition-all">
              <button
                className="absolute right-3 top-3 rounded-sm opacity-50 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              {title && <h2 className="text-lg font-semibold">{title}</h2>}
              {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
              <div className="mt-4">{children}</div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
