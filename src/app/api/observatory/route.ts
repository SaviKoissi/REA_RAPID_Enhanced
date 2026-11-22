import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"
import type { FieldRecord } from "@/types"

export async function GET(req: Request) {
  const adapter = createAdapter()
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("orgId") || undefined
  const observations = await adapter.listObservations(orgId)
  return NextResponse.json(observations)
}

export const dynamic = "force-dynamic"
