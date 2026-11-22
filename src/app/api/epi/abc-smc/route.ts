import { NextResponse } from "next/server"
import { runABCSMC } from "@/lib/epi/engine"

export async function POST(req: Request) {
  const body = await req.json()
  const result = runABCSMC(body)
  return NextResponse.json(result)
}
