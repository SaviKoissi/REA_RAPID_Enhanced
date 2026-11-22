"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DropdownMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  anchor?: React.ReactNode
}

export function DropdownMenu({ open, onOpenChange, children }: DropdownMenuProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)

  return (
    <div className="relative inline-block" ref={(el) => setAnchorEl(el)}>
      {open && anchorEl ? (
        <div className="absolute z-50 mt-2 w-56 rounded-xl border border-input bg-background shadow-lg p-1 animate-in fade-in slide-in-from-top-2 z-[60]">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export type DropdownMenuTriggerProps = React.HTMLAttributes<HTMLButtonElement>
export function DropdownMenuTrigger({ children, ...props }: DropdownMenuTriggerProps) {
  return <button className="flex items-center gap-1 text-sm font-medium" {...props}>{children} <ChevronRight className="h-4 w-4" /></button>
}

export type DropdownMenuContentProps = React.HTMLAttributes<HTMLDivElement>
export function DropdownMenuContent({ className, children, ...props }: DropdownMenuContentProps) {
  return <div className={cn("", className)} {...props}>{children}</div>
}

export interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean
}
export function DropdownMenuItem({ className, disabled, children, ...props }: DropdownMenuItemProps) {
  return (
    <div
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm px-3 py-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        disabled && "text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type DropdownMenuSeparatorProps = React.HTMLAttributes<HTMLDivElement>
export function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return <div className={cn("-mx-1 h-px bg-border my-2", className)} {...props} />
}

export type DropdownMenuLabelProps = React.HTMLAttributes<HTMLDivElement>
export function DropdownMenuLabel({ className, children, ...props }: DropdownMenuLabelProps) {
  return <div className={cn("px-3 py-1.5 text-xs font-semibold text-muted-foreground", className)} {...props}>{children}</div>
}
