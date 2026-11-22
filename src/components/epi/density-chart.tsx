"use client"

import type { DensityPoint } from "@/types"

interface DensityChartProps {
  title: string
  prior: DensityPoint[]
  posterior: DensityPoint[]
  priorRange: [number, number]
  className?: string
}

export function DensityChart({ title, prior, posterior, priorRange, className }: DensityChartProps) {
  const width = 260
  const height = 130
  const pad = 32
  const plotW = width - pad * 2
  const plotH = height - 40

  const allX = [...prior.map((p) => p.x), ...posterior.map((p) => p.x)]
  const allY = [...prior.map((p) => p.y), ...posterior.map((p) => p.y)]
  const xMin = Math.min(...allX)
  const xMax = Math.max(...allX)
  const yMax = Math.max(...allY, 1)

  const scaleX = (x: number) => pad + ((x - xMin) / (xMax - xMin || 1)) * plotW
  const scaleY = (y: number) => height - 16 - (y / yMax) * plotH

  const line = (pts: DensityPoint[], stroke: string) => {
    const d = pts
      .map((p, i) => (i === 0 ? `M${scaleX(p.x)},${scaleY(p.y)}` : `L${scaleX(p.x)},${scaleY(p.y)}`))
      .join(" ")
    return <path d={d} fill="none" stroke={stroke} strokeWidth={2} />
  }

  const area = (pts: DensityPoint[], fill: string) => {
    const d = [
      `M${scaleX(pts[0]?.x ?? xMin)},${height - 16}`,
      ...pts.map((p) => `L${scaleX(p.x)},${scaleY(p.y)}`),
      `L${scaleX(pts[pts.length - 1]?.x ?? xMax)},${height - 16}`,
      "Z",
    ].join(" ")
    return <path d={d} fill={fill} fillOpacity={0.15} />
  }

  return (
    <div className={className}>
      <div className="text-[10px] text-muted-foreground mb-1">{title}</div>
      <svg width={width} height={height} className="text-muted-foreground">
        {area(prior, "#94a3b8")}
        {area(posterior, "#2563eb")}
        {line(prior, "#64748b")}
        {line(posterior, "#2563eb")}
        <line x1={scaleX(priorRange[0])} y1={height - 16 - plotH} x2={scaleX(priorRange[0])} y2={height - 16} stroke="#94a3b8" strokeDasharray="4 2" strokeWidth={1} />
        <line x1={scaleX(priorRange[1])} y1={height - 16 - plotH} x2={scaleX(priorRange[1])} y2={height - 16} stroke="#94a3b8" strokeDasharray="4 2" strokeWidth={1} />
        <text x={pad} y={height - 4} fontSize="9" fill="#94a3b8">
          {xMin.toFixed(2)}
        </text>
        <text x={width - pad - 20} y={height - 4} fontSize="9" fill="#94a3b8" textAnchor="end">
          {xMax.toFixed(2)}
        </text>
      </svg>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-500" /> prior</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-600" /> posterior</span>
      </div>
    </div>
  )
}
