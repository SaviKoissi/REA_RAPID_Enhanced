"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ToggleProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  className?: string
}

export function Toggle({ checked = false, defaultChecked, onCheckedChange, className }: ToggleProps) {
  const [isChecked, setIsChecked] = React.useState(defaultChecked ?? checked)
  const handleClick = () => {
    const next = !isChecked
    setIsChecked(next)
    onCheckedChange?.(next)
  }
  return (
    <button
      role="switch"
      aria-checked={isChecked}
      type="button"
      className={cn(
        "inline-flex items-center justify-center cursor-pointer rounded-full border border-input bg-transparent p-0.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        isChecked ? "data-[state=checked]" : "data-[state=unchecked]",
        className
      )}
      onClick={handleClick}
    >
      <span className={cn("block h-5 w-5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0")} />
    </button>
  )
}
