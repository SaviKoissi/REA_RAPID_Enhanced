import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"
import type { FieldRecord, FieldIngestionResult, DiagnosticStatus, HostCrop } from "@/types"

const REQUIRED = [
  "sample_id",
  "latitude",
  "longitude",
  "date",
  "host_crop",
  "diagnostic_status",
  "vector_density",
  "survey_effort",
  "org_id",
  "submitted_by",
] as const

const STATUSES: DiagnosticStatus[] = ["Susceptible", "Exposed", "Infectious", "Removed"]
const CROPS: HostCrop[] = ["cassava", "banana", "plantain", "other"]

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeRecord(raw: Record<string, unknown>): Omit<FieldRecord, "geometry"> {
  const get = (k: string) => raw[k] ?? raw[k.toLowerCase()] ?? raw[k.toUpperCase()]
  return {
    sample_id: String(get("sample_id") ?? ""),
    latitude: parseNumber(get("latitude")) ?? 0,
    longitude: parseNumber(get("longitude")) ?? 0,
    date: String(get("date") ?? ""),
    host_crop: (String(get("host_crop") ?? "other").toLowerCase() as HostCrop),
    diagnostic_status: (String(get("diagnostic_status") ?? "Susceptible") as DiagnosticStatus),
    vector_density: parseNumber(get("vector_density")) ?? 0,
    survey_effort: parseNumber(get("survey_effort")) ?? 0,
    org_id: String(get("org_id") ?? ""),
    submitted_by: String(get("submitted_by") ?? ""),
    notes: String(get("notes") ?? ""),
  }
}

function validate(rec: Omit<FieldRecord, "geometry">): string[] {
  const errors: string[] = []
  if (!rec.sample_id) errors.push("sample_id is required")
  if (rec.latitude == null || rec.latitude < -90 || rec.latitude > 90) errors.push("latitude out of range")
  if (rec.longitude == null || rec.longitude < -180 || rec.longitude > 180) errors.push("longitude out of range")
  if (!rec.date) errors.push("date is required")
  else if (isNaN(Date.parse(rec.date))) errors.push("date must be ISO 8601")
  if (!rec.host_crop || !CROPS.includes(rec.host_crop)) errors.push("host_crop must be cassava/banana/plantain/other")
  if (!rec.diagnostic_status || !STATUSES.includes(rec.diagnostic_status)) {
    errors.push("diagnostic_status must be Susceptible/Exposed/Infectious/Removed")
  }
  if (rec.vector_density == null || rec.vector_density < 0) errors.push("vector_density must be >= 0")
  if (rec.survey_effort == null || rec.survey_effort <= 0) errors.push("survey_effort must be > 0")
  if (!rec.org_id) errors.push("org_id is required")
  if (!rec.submitted_by) errors.push("submitted_by is required")
  return errors
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const header = lines[0].split(",").map((h) => h.trim())
  const out: Record<string, unknown>[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",")
    const row: Record<string, unknown> = {}
    header.forEach((h, idx) => {
      row[h] = vals[idx]?.trim() ?? ""
    })
    out.push(row)
  }
  return out
}

function parseGeoJson(text: string): Record<string, unknown>[] {
  try {
    const gj = JSON.parse(text) as {
      type?: string
      features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }>
      properties?: Record<string, unknown>
      geometry?: { coordinates?: [number, number] }
    }
    const features = gj.features ?? (gj.type === "Feature" ? [gj] : [])
    return features.map((f) => {
      const props = f.properties ?? {}
      const geom = f.geometry
      if (geom?.coordinates) {
        const [lon, lat] = geom.coordinates
        props.longitude = lon
        props.latitude = lat
      }
      return props
    })
  } catch {
    return []
  }
}

export async function POST(req: Request) {
  const adapter = createAdapter()
  const contentType = req.headers.get("content-type") ?? ""

  let records: Omit<FieldRecord, "geometry">[] = []

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("file")
    const org_id = String(form.get("org_id") ?? "")
    const submitted_by = String(form.get("submitted_by") ?? "")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file field is required" }, { status: 400 })
    }

    const text = await file.text()
    const name = file.name.toLowerCase()
    let parsed: Record<string, unknown>[]
    if (name.endsWith(".geojson") || name.endsWith(".json")) {
      parsed = parseGeoJson(text)
    } else {
      parsed = parseCsv(text)
    }

    records = parsed.map((p) => {
      const rec = normalizeRecord(p)
      if (org_id) rec.org_id = org_id
      if (submitted_by) rec.submitted_by = submitted_by
      return rec
    })
  } else {
    const body = await req.json()
    const items = Array.isArray(body) ? body : [body]
    records = items.map((r) => normalizeRecord(r as Record<string, unknown>))
  }

  const result: FieldIngestionResult = {
    accepted: [],
    rejected: [],
    total: records.length,
    accepted_count: 0,
    rejected_count: 0,
  }

  for (const rec of records) {
    const errors = validate(rec)
    if (errors.length) {
      result.rejected.push({ record: rec as Record<string, unknown>, errors })
      continue
    }
    const created = await adapter.createObservation(rec)
    result.accepted.push(created)
  }

  result.accepted_count = result.accepted.length
  result.rejected_count = result.rejected.length

  const status = result.rejected_count === 0 ? 200 : result.accepted_count === 0 ? 400 : 207
  return NextResponse.json({ ...result, status }, { status })
}
