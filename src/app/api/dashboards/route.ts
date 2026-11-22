import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"
import type { DashboardEntry } from "@/types"

export async function GET(req: Request) {
  const adapter = createAdapter()
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("orgId") || undefined
  const dashboards = await adapter.listDashboards(orgId)
  return NextResponse.json(dashboards)
}

export async function POST(req: Request) {
  const adapter = createAdapter()
  const body = await req.json()
  const entry = await adapter.createDashboard(body as Omit<DashboardEntry, "key" | "createdAt" | "updatedAt">)
  return NextResponse.json(entry, { status: 201 })
}
