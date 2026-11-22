import { NextResponse } from "next/server"
import { compareScenarios } from "@/lib/epi/engine"

export async function POST(req: Request) {
  const body = await req.json()
  const result = compareScenarios(body.scenarios)
  return NextResponse.json(result)
}
