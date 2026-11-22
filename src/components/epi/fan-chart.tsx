"use client"

import type { ProjectionTrajectory } from "@/types"

interface FanChartProps {
  scenarios: Array<{
    id: string
    name: string
    color: string
    trajectories: ProjectionTrajectory[]
  }>
  className?: string
}

export function FanChart({ scenarios, className }: FanChartProps) {
  const width = 340
  const height = 210
  const pad = 40
  const plotW = width - pad
  const plotH = height - 40

  const allPoints = scenarios.flatMap((s) => s.trajectories)
  const maxY = Math.max(1, ...allPoints.map((p) => p.ciUpper))
  const maxX = Math.max(...allPoints.map((p) => p.timeStep))

  const scaleX = (t: number) => pad + (t / maxX) * plotW
  const scaleY = (v: number) => height - 16 - (v / maxY) * plotH

  const area = (upper: ProjectionTrajectory[], lower: ProjectionTrajectory[], fill: string) => {
    const d = [
      `M${scaleX(upper[0]?.timeStep ?? 0)},${scaleY(upper[0]?.ciUpper ?? 0)}`,
      ...upper.map((p) => `L${scaleX(p.timeStep)},${scaleY(p.ciUpper)}`),
      ...lower
        .slice()
        .reverse()
        .map((p) => `L${scaleX(p.timeStep)},${scaleY(p.ciLower)}`),
      "Z",
    ].join(" ")
    return <path d={d} fill={fill} fillOpacity={0.12} />
  }

  const line = (pts: ProjectionTrajectory[], accessor: (p: ProjectionTrajectory) => number, stroke: string) => {
    const d = pts
      .map((p, i) => (i === 0 ? `M${scaleX(p.timeStep)},${scaleY(accessor(p))}` : `L${scaleX(p.timeStep)},${scaleY(accessor(p))}`))
      .join(" ")
    return <path d={d} fill="none" stroke={stroke} strokeWidth={2} />
  }

  return (
    <div className={className}>
      <div className="text-[10px] text-muted-foreground mb-2">Projected prevalence (fan chart, 95% CI)</div>
      <svg width={width} height={height} className="text-muted-foreground">
        {scenarios.map((s) => area(s.trajectories, s.trajectories, s.color))}
        {scenarios.map((s) => line(s.trajectories, (p) => p.meanPrevalence, s.color))}
        <polyline
          points="0,0"
          stroke="none"
          fill="none"
        />
        <line x1={pad} y1={scaleY(0)} x2={scaleX(maxX)} y2={scaleY(0)} stroke="#e2e8f0" strokeWidth={1} />
        {Array.from({ length: 5 }).map((_, i) => {
          const y = (maxY * i) / 4
          return (
            <>
              <line x1={pad} y1={scaleY(y)} x2={scaleX(maxX)} y2={scaleY(y)} stroke="#f1f5f9" strokeWidth={1} />
              <text x={pad - 6} y={scaleY(y) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">
                {y.toFixed(2)}
              </text>
            </>
          )
        })}
        <text x={pad} y={height - 4} fontSize="9" fill="#94a3b8">0</text>
        <text x={scaleX(maxX) - 20} y={height - 4} fontSize="9" fill="#94a3b8" textAnchor="end">
          T{maxX}
        </text>
        <defs>
          {scenarios.map((s) => (
            <marker key={s.id} id={`arrow-${s.id}`} markerWidth="8" markerHeight="8" refX={4} refY={3} orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={s.color} />
            </marker>
          ))}
        </defs>
      </svg>
      <div className="flex gap-4 mt-2 text-[10px]">
        {scenarios.map((s) => (
          <span key={s.id} className="flex items-center gap-1">
            <span className="w-3 h-0.5" style={{ backgroundColor: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

interface ScenarioCardProps {
  scenario: {
    id: string
    name: string
    color: string
    finalPrevalence: number
    totalCasesAvertedVsBaseline: number
    trajectories: ProjectionTrajectory[]
  }
  isBaseline?: boolean
}

export function ScenarioCard({ scenario, isBaseline }: ScenarioCardProps) {
  const final = scenario.trajectories[scenario.trajectories.length - 1]
  return (
    <div className={`rounded-lg border p-3 ${isBaseline ? "bg-red-50 border-red-200" : "bg-purple-50 border-purple-200"}`}>
      <div className="flex justify-between items-start mb-2">
        <span className="font-semibold text-sm">{scenario.name}</span>
        <span className="text-[10px] font-mono">{scenario.color}</span>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div>Final prevalence: <span className="font-mono font-medium">{scenario.finalPrevalence.toFixed(3)}</span></div>
        <div>
          Cases averted vs baseline:{" "}
          <span className={`font-mono font-medium ${scenario.totalCasesAvertedVsBaseline >= 0 ? "text-green-700" : "text-red-700"}`}>
            {scenario.totalCasesAvertedVsBaseline.toLocaleString()}
          </span>
        </div>
        <div>
          Month {scenario.trajectories.length - 1} mean:{" "}
          <span className="font-mono font-medium">{final.meanPrevalence.toFixed(3)}</span>
        </div>
        <div>
          95% CI: [{final.ciLower.toFixed(3)}, {final.ciUpper.toFixed(3)}]
        </div>
      </div>
    </div>
  )
}
