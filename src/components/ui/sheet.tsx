"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: string
}

export function Sheet({ open, onOpenChange, children, title }: SheetProps) {
  return (
    <div className="fixed inset-0 z-50">
      {open ? (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-background border-l border-input shadow-2xl transform transition-transform duration-300 translate-x-0">
            <div className="flex justify-between items-center px-6 py-4 border-b border-input">
              {title && <h2 className="font-semibold">{title}</h2>}
              <button className="opacity-50 hover:opacity-100" onClick={() => onOpenChange(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">{children}</div>
          </div>
        </>
      ) : null}
    </div>
  )
}
