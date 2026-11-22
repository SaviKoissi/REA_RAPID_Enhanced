"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export function Checkbox({ checked = false, onCheckedChange, className, ...props }: CheckboxProps) {
  const [isChecked, setIsChecked] = React.useState(checked)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setIsChecked(next)
    onCheckedChange?.(next)
  }
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={handleChange}
        className="sr-only peer"
        {...props}
      />
      <span className={cn(
        "inline-flex items-center justify-center rounded-sm border border-input bg-background text-primary-foreground shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-background peer",
        isChecked ? "data-[state=checked]" : "data-[state=unchecked]"
      )}>
        {isChecked ? <Check className="h-4 w-4" /> : null}
      </span>
    </span>
  )
}
