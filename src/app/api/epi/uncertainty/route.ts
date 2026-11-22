import { NextResponse } from "next/server"
import { computeUncertaintyMap } from "@/lib/epi/engine"

export async function POST(req: Request) {
  const body = await req.json()
  const result = computeUncertaintyMap(body.points, body.opts)
  return NextResponse.json(result)
}
