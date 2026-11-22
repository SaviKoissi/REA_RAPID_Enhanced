"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  value?: string
  onValueChange?: (value: string) => void
}

export function Select({ className, value, onValueChange, ...props }: SelectProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onValueChange?.(e.target.value)
  }
  return (
    <select
      value={value}
      onChange={handleChange}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-medium border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export type SelectTriggerProps = React.HTMLAttributes<HTMLDivElement>
export function SelectTrigger({ className, children, ...props }: SelectTriggerProps) {
  return (
    <div className={cn("flex items-center justify-between rounded-medium border border-input bg-background px-3 py-2 text-sm focus:outline-none", className)} {...props}>
      {children}
      <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50 transition-opacity" />
    </div>
  )
}

export type SelectContentProps = React.HTMLAttributes<HTMLDivElement>
export function SelectContent({ className, children, ...props }: SelectContentProps) {
  return (
    <div className={cn("z-50 min-w-[8rem] overflow-hidden rounded-medium border border-input bg-background text-foreground shadow-lg", className)} {...props}>
      {children}
    </div>
  )
}

export interface SelectItemProps {
  value: string
  children: React.ReactNode
  className?: string
}
export function SelectItem({ value, children, className }: SelectItemProps) {
  return <option value={value} className={className}>{children}</option>
}

export interface SelectValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  placeholder?: string
}
export function SelectValue({ className, children, placeholder, ...props }: SelectValueProps) {
  return <span className={cn("flex w-full items-center truncate", className)} {...props}>{children ?? placeholder}</span>
}

export type SelectGroupProps = React.HTMLAttributes<HTMLDivElement>
export function SelectGroup({ className, children, ...props }: SelectGroupProps) {
  return <div className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className)} {...props}>{children}</div>
}

export type SelectSeparatorProps = React.HTMLAttributes<HTMLDivElement>
export function SelectSeparator({ className, ...props }: SelectSeparatorProps) {
  return <div className={cn("-mx-1 h-px bg-border", className)} {...props} />
}
