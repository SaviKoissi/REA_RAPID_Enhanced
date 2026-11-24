import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"
import type { DashboardEntry } from "@/types"

async function resolveKey(key: string): Promise<DashboardEntry | null> {
  const adapter = createAdapter()
  // Try the key exactly as provided (e.g. "dash_<slug>_<rand>").
  let entry = await adapter.getDashboard(key)
  if (entry) return entry
  // Try with "dashboard_" prefix (legacy KV namespace convention).
  const prefixed = `dashboard_${key.startsWith("dashboard_") ? "" : key}`
  entry = await adapter.getDashboard(prefixed)
  if (entry) return entry
  // Try stripping a "dashboard_" prefix if present.
  const stripped = key.startsWith("dashboard_") ? key.slice("dashboard_".length) : key
  if (stripped !== key) {
    entry = await adapter.getDashboard(stripped)
    if (entry) return entry
  }
  return null
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const entry = await resolveKey(key)
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(entry)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const entry = await resolveKey(key)
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const body = await req.json()
  const adapter = createAdapter()
  const updated = await adapter.updateDashboard(entry.key, body as Partial<DashboardEntry>)
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const entry = await resolveKey(key)
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const adapter = createAdapter()
  await adapter.deleteDashboard(entry.key)
  return new NextResponse(null, { status: 204 })
}
