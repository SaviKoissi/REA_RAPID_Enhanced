import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"

export async function GET(req: Request) {
  const adapter = createAdapter()
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("orgId") || undefined
  const files = await adapter.listFiles(orgId)
  return NextResponse.json(files)
}

export async function POST(req: Request) {
  const adapter = createAdapter()
  const body = await req.json()
  const file = await adapter.createFile(body)
  return NextResponse.json(file, { status: 201 })
}
