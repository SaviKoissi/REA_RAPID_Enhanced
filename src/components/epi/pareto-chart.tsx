"use client"

import { Badge } from "@/components/ui/badge"
import type { ParetoPoint, PortfolioResult } from "@/types"

interface ParetoChartProps {
  points: ParetoPoint[]
  highlighted?: string
  className?: string
}

export function ParetoChart({ points, highlighted, className }: ParetoChartProps) {
  const width = 360
  const height = 220
  const pad = 45
  const plotW = width - pad - 20
  const plotH = height - 40

  if (points.length === 0) return null

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1

  const scaleX = (x: number) => pad + ((x - xMin) / xRange) * plotW
  const scaleY = (y: number) => height - 20 - ((y - yMin) / yRange) * plotH

  // Pareto frontier line (sorted by cost ascending, benefit must be non-decreasing)
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const frontier: ParetoPoint[] = []
  let maxY = -Infinity
  for (const p of sorted) {
    if (p.y >= maxY) {
      frontier.push(p)
      maxY = p.y
    }
  }

  const lineD = frontier
    .map((p, i) => (i === 0 ? `M${scaleX(p.x)},${scaleY(p.y)}` : `L${scaleX(p.x)},${scaleY(p.y)}`))
    .join(" ")

  return (
    <div className={className}>
      <div className="text-[10px] text-muted-foreground mb-2">Pareto frontier (cost vs NPV saved)</div>
      <svg width={width} height={height} className="text-muted-foreground">
        {/* frontier line */}
        <path d={lineD} fill="none" stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" />
        {/* all portfolios */}
        {points.map((p) => (
          <circle
            key={p.portfolioId}
            cx={scaleX(p.x)}
            cy={scaleY(p.y)}
            r={4}
            fill={p.portfolioId === highlighted ? "#ef4444" : "#94a3b8"}
            stroke={p.portfolioId === highlighted ? "#ef4444" : "#ffffff"}
            strokeWidth={2}
          />
        )}
        <line x1={pad} y1={scaleY(yMin)} x2={scaleX(xMax)} y2={scaleY(yMin)} stroke="#e2e8f0" strokeWidth={1} />
        <line x1={pad} y1={scaleY(yMin)} x2={pad} y2={scaleY(yMax)} stroke="#e2e8f0" strokeWidth={1} />
        <text x={pad + plotW + 5} y={height - 8} fontSize="9" fill="#94a3b8">
          Cost (USD)
        </text>
        <text x={pad - 8} y={height - 20 - plotH - 6} fontSize="9" fill="#94a3b8" textAnchor="end">
          NPV saved (USD)
        </text>
      </svg>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
        <span>{xMin.toLocaleString()}</span>
        <span>{xMax.toLocaleString()}</span>
      </div>
    </div>
  )
}

interface DecisionMatrixProps {
  portfolios: PortfolioResult[]
  onSelect?: (id: string) => void
  selectedId?: string
  className?: string
}

export function DecisionMatrix({
  portfolios,
  onSelect,
  selectedId,
  className,
}: DecisionMatrixProps) {
  const sorted = [...portfolios].sort((a, b) => b.benefitCostRatio - a.benefitCostRatio)
  return (
    <div className={className}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[10px] text-muted-foreground border-b border-border">
            <th className="pb-1">Portfolio</th>
            <th className="pb-1 text-right">NPV saved (USD)</th>
            <th className="pb-1 text-right">Cost (USD)</th>
            <th className="pb-1 text-right">BCR</th>
            <th className="pb-1 text-right">Yield saved (t)</th>
            <th className="pb-1 text-center">Pareto</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.id}
              className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${
                p.id === selectedId ? "bg-blue-50" : ""
              } ${p.isParetoOptimal ? "border-l-2 border-green-500" : ""}`}
              onClick={() => onSelect?.(p.id)}
            >
              <td className="py-1.5 text-xs font-medium truncate max-w-[140px]">
                {p.name} {p.isParetoOptimal && <span className="text-[9px] text-green-600 ml-1">◆</span>}
              </td>
              <td className="py-1.5 text-xs text-right font-mono">{p.npvSavedUSD.toLocaleString()}</td>
              <td className="py-1.5 text-xs text-right font-mono">{p.interventionCostUSD.toLocaleString()}</td>
              <td className="py-1.5 text-xs text-right font-mono">{p.benefitCostRatio.toFixed(2)}</td>
              <td className="py-1.5 text-xs text-right font-mono">{p.yieldSavedTons.toLocaleString()}</td>
              <td className="py-1.5 text-xs text-center">
                <Badge
                  variant={p.isParetoOptimal ? "default" : "outline"}
                  className="text-[10px] px-1.5 py-0.5"
                >
                  {p.isParetoOptimal ? "Yes" : "No"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}