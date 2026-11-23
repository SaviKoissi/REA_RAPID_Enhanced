import { NextResponse } from "next/server"
import { computeUncertaintyMap } from "@/lib/epi/engine"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const isCbsd = (body.pathosystem ?? "CBSD") === "CBSD"

    const rawPoints = Array.isArray(body.points)
      ? body.points
      : Array.isArray(body.observations)
        ? body.observations
        : []

    const points = rawPoints.map((p: Record<string, unknown>) => {
      const statusVal =
        p.diagnostic_status === "Infectious"
          ? 1.0
          : p.diagnostic_status === "Exposed"
            ? 0.6
            : p.diagnostic_status === "Removed"
              ? 0.3
              : 0.1
      return {
        x: Number(p.x ?? p.longitude ?? p.lng ?? 0),
        y: Number(p.y ?? p.latitude ?? p.lat ?? 0),
        value: p.value !== undefined ? Number(p.value) : statusVal,
      }
    })

    const defaultBounds: [[number, number], [number, number]] = isCbsd
      ? [[2.68, 4.0], [14.68, 13.9]]
      : [[0.97, 6.15], [3.87, 12.41]]

    const opts = {
      bounds: body.opts?.bounds ?? body.bounds ?? defaultBounds,
      resolution: body.opts?.resolution ?? body.resolution ?? 24,
      method: (body.opts?.method ?? body.method ?? "kriging") as "kriging" | "idw" | "kernel",
      confidence: body.opts?.confidence ?? body.confidence ?? 0.95,
    }

    const result = computeUncertaintyMap(points, opts)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Uncertainty map computation failed" },
      { status: 400 }
    )
  }
}
