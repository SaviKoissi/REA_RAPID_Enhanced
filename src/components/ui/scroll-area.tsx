"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function ScrollArea({ className = "", children, ...props }: ScrollAreaProps) {
  return (
    <div className={cn("overflow-auto rounded-medium border-border", className)} {...props}>
      {children}
    </div>
  )
}

export type ScrollBarProps = React.HTMLAttributes<HTMLDivElement>
export function ScrollBar({ className, ...props }: ScrollBarProps) {
  return (
    <div className={cn("h-4 w-4 rounded-full bg-accent/50", className)} {...props} />
  )
}
