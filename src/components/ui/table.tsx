"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type TableProps = React.HTMLAttributes<HTMLTableElement>

export function Table({ className, ...props }: TableProps) {
  return <table className={cn("w-full text-sm caption-medium rtl:caption-start text-left", className)} {...props} />
}

export type TableHeaderProps = React.HTMLAttributes<HTMLTableSectionElement>
export function TableHeader({ className, ...props }: TableHeaderProps) {
  return <thead className={cn("", className)} {...props} />
}

export type TableBodyProps = React.HTMLAttributes<HTMLTableSectionElement>
export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody className={cn("[&_tr]:last:border-b-0", className)} {...props} />
}

export type TableFooterProps = React.HTMLAttributes<HTMLTableSectionElement>
export function TableFooter({ className, ...props }: TableFooterProps) {
  return <tfoot className={cn("", className)} {...props} />
}

export type TableRowProps = React.HTMLAttributes<HTMLTableRowElement>
export function TableRow({ className, ...props }: TableRowProps) {
  return <tr className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props} />
}

export interface TableHeadProps extends React.HTMLAttributes<HTMLTableCellElement> {
  className?: string
}
export function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <th
      className={cn(
        "h-10 px-4 text-left align-middle font-medium text-muted-foreground [&_tr]:border-b",
        className
      )}
      {...props}
    />
  )
}

export interface TableCellProps extends React.HTMLAttributes<HTMLTableCellElement> {
  className?: string
}
export function TableCell({ className, ...props }: TableCellProps) {
  return <td className={cn("p-4 align-middle [&_tr:last-child]:border-b-0", className)} {...props} />
}

export type TableCaptionProps = React.HTMLAttributes<HTMLTableCaptionElement>
export function TableCaption({ className, ...props }: TableCaptionProps) {
  return <caption className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
}
