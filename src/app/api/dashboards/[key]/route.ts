import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"
import type { DashboardEntry } from "@/types"

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const adapter = createAdapter()
  const { key } = await params
  const entry = await adapter.getDashboard(`dashboard_${key.startsWith("dashboard_") ? "" : ""}${key}`)
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(entry)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const adapter = createAdapter()
  const { key } = await params
  const fullKey = `dashboard_${key.startsWith("dashboard_") ? key.slice("dashboard_".length) : key}`
  const body = await req.json()
  const entry = await adapter.updateDashboard(fullKey, body as Partial<DashboardEntry>)
  return NextResponse.json(entry)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const adapter = createAdapter()
  const { key } = await params
  const fullKey = `dashboard_${key.startsWith("dashboard_") ? key.slice("dashboard_".length) : key}`
  await adapter.deleteDashboard(fullKey)
  return new NextResponse(null, { status: 204 })
}
