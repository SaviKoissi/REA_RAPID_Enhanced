"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
}

export function Avatar({ src, alt, className, ...props }: AvatarProps) {
  return (
    <div
      className={cn("relative flex shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    >
      {src ? <img src={src} alt={alt ?? "avatar"} className="aspect-square object-cover h-full w-full" /> : null}
    </div>
  )
}

export type AvatarFallbackProps = React.HTMLAttributes<HTMLDivElement>
export function AvatarFallback({ className, ...props }: AvatarFallbackProps) {
  return <div className={cn("flex items-center justify-center w-full h-full text-muted-foreground", className)} {...props} />
}
