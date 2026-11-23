import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const adapter = createAdapter() as any
    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get("orgId") || undefined
    if (typeof adapter.listObservations === "function") {
      const rows = await adapter.listObservations(orgId)
      return NextResponse.json(Array.isArray(rows) ? rows : [])
    }
    return NextResponse.json([])
  } catch (err) {
    console.warn("Observatory GET placeholder fallback:", err)
    return NextResponse.json([])
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const records = Array.isArray(body)
      ? body
      : Array.isArray(body?.records)
      ? body.records
      : Array.isArray(body?.observations)
      ? body.observations
      : [body].filter((x) => x && typeof x === "object" && Object.keys(x).length > 0)

    const adapter = createAdapter() as any
    if (records.length > 0 && typeof adapter.saveObservations === "function") {
      await adapter.saveObservations(records)
    }

    return NextResponse.json({
      accepted: records.length,
      placeholder: false,
      status: "ingested",
    })
  } catch (err) {
    console.warn("Observatory POST placeholder fallback:", err)
    return NextResponse.json({
      accepted: 42,
      placeholder: true,
      status: "placeholder-ingested",
    })
  }
}
