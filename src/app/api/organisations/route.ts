import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"

export async function GET() {
  const adapter = createAdapter()
  const orgs = await adapter.listOrganisations()
  return NextResponse.json(orgs)
}

export async function POST(req: Request) {
  const adapter = createAdapter()
  const body = await req.json()
  const org = await adapter.createOrganisation(body)
  return NextResponse.json(org, { status: 201 })
}
