"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
}

export function Separator({ orientation = "horizontal", decorative = true, className, ...props }: SeparatorProps) {
  return (
    <hr
      className={cn(
        "relative flex w-full shrink-0 border-y" +
          (orientation === "horizontal" ? " h-[1px]" : " h-full w-[1px] border-x"),
        className
      )}
      aria-hidden={decorative}
      {...props}
    />
  )
}
