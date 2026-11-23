import { PersistenceAdapter } from "./adapter"
import type {
  DashboardEntry,
  User,
  Organisation,
  FileEntry,
  FileVersion,
  FieldRecord,
  FieldIngestionResult,
} from "@/types"
import { Pool } from "pg"
import Redis from "ioredis"

function safeUUID(): string {
  try {
    if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


const NOW = () => new Date().toISOString()
function generateId(prefix = "id") {
  return `${prefix}_${safeUUID()}`
}

export class PostgresAdapter implements PersistenceAdapter {
  private pool: Pool
  private redis: Redis | null = null
  private readonly ttl = 300 // 5 min cache

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    })
    const redisUrl = process.env.REDIS_URL
    if (redisUrl) {
      this.redis = new Redis(redisUrl)
    }
  }

  private cacheKey(kind: string, id: string) {
    return `rapid:${kind}:${id}`
  }

  private async getCache<T>(kind: string, id: string): Promise<T | null> {
    if (!this.redis) return null
    const raw = await this.redis.get(this.cacheKey(kind, id))
    if (!raw) return null
    return JSON.parse(raw) as T
  }

  private async setCache<T>(kind: string, id: string, value: T) {
    if (!this.redis) return
    await this.redis.setex(this.cacheKey(kind, id), this.ttl, JSON.stringify(value))
  }

  private async delCache(kind: string, id: string) {
    if (!this.redis) return
    await this.redis.del(this.cacheKey(kind, id))
  }

  async health(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1")
      return true
    } catch {
      return false
    }
  }

  async listDashboards(orgId?: string): Promise<DashboardEntry[]> {
    const cache = await this.getCache<DashboardEntry[]>("dashboards", orgId ?? "all")
    if (cache) return cache
    let query = "SELECT payload FROM dashboards"
    const params: unknown[] = []
    if (orgId) {
      query += " WHERE (payload->>'orgId') = $1"
      params.push(orgId)
    }
    query += " ORDER BY (payload->>'updatedAt') DESC"
    const res = await this.pool.query(query, params)
    const rows = res.rows.map((r) => r.payload as DashboardEntry)
    await this.setCache("dashboards", orgId ?? "all", rows)
    return rows
  }

  async getDashboard(key: string): Promise<DashboardEntry | null> {
    const cache = await this.getCache<DashboardEntry>("dashboard", key)
    if (cache) return cache
    const res = await this.pool.query(
      "SELECT payload FROM dashboards WHERE (payload->>'key') = $1",
      [key]
    )
    if (res.rowCount === 0) return null
    const entry = res.rows[0].payload as DashboardEntry
    await this.setCache("dashboard", key, entry)
    return entry
  }

  async createDashboard(entry: Omit<DashboardEntry, "key" | "createdAt" | "updatedAt">): Promise<DashboardEntry> {
    const key = `dashboard_${safeUUID()}`
    const now = NOW()
    const full: DashboardEntry = { ...entry, key, createdAt: now, updatedAt: now }
    await this.pool.query(
      "INSERT INTO dashboards (key, payload) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET payload = $2",
      [key, JSON.stringify(full)]
    )
    await this.setCache("dashboard", key, full)
    await this.delCache("dashboards", full.orgId)
    return full
  }

  async updateDashboard(key: string, patch: Partial<DashboardEntry>): Promise<DashboardEntry> {
    const existing = await this.getDashboard(key)
    if (!existing) throw new Error(`Dashboard ${key} not found`)
    const updated: DashboardEntry = { ...existing, ...patch, key, updatedAt: NOW() }
    await this.pool.query(
      "INSERT INTO dashboards (key, payload) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET payload = $2",
      [key, JSON.stringify(updated)]
    )
    await this.setCache("dashboard", key, updated)
    await this.delCache("dashboards", updated.orgId)
    return updated
  }

  async deleteDashboard(key: string): Promise<void> {
    const existing = await this.getDashboard(key)
    await this.pool.query("DELETE FROM dashboards WHERE (payload->>'key') = $1", [key])
    await this.delCache("dashboard", key)
    if (existing) await this.delCache("dashboards", existing.orgId)
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const res = await this.pool.query(
      "SELECT payload FROM users WHERE (payload->>'email') = $1",
      [email]
    )
    if (res.rowCount === 0) return null
    return res.rows[0].payload as User
  }

  async getUser(id: string): Promise<User | null> {
    const cache = await this.getCache<User>("user", id)
    if (cache) return cache
    const res = await this.pool.query("SELECT payload FROM users WHERE (payload->>'id') = $1", [id])
    if (res.rowCount === 0) return null
    const user = res.rows[0].payload as User
    await this.setCache("user", id, user)
    return user
  }

  async createUser(user: Omit<User, "id">): Promise<User> {
    const id = generateId("user")
    const full: User = { ...user, id }
    await this.pool.query(
      "INSERT INTO users (id, payload) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET payload = $2",
      [id, JSON.stringify(full)]
    )
    await this.setCache("user", id, full)
    return full
  }

  async updateUser(id: string, patch: Partial<User>): Promise<User> {
    const existing = await this.getUser(id)
    if (!existing) throw new Error(`User ${id} not found`)
    const updated: User = { ...existing, ...patch }
    await this.pool.query(
      "INSERT INTO users (id, payload) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET payload = $2",
      [id, JSON.stringify(updated)]
    )
    await this.setCache("user", id, updated)
    return updated
  }

  async listOrganisations(): Promise<Organisation[]> {
    const res = await this.pool.query("SELECT payload FROM organisations ORDER BY (payload->>'createdAt') DESC")
    return res.rows.map((r) => r.payload as Organisation)
  }

  async getOrganisation(id: string): Promise<Organisation | null> {
    const res = await this.pool.query("SELECT payload FROM organisations WHERE (payload->>'id') = $1", [id])
    if (res.rowCount === 0) return null
    return res.rows[0].payload as Organisation
  }

  async createOrganisation(org: Omit<Organisation, "id" | "createdAt" | "members">): Promise<Organisation> {
    const id = generateId("org")
    const full: Organisation = { ...org, id, createdAt: NOW(), members: [] }
    await this.pool.query(
      "INSERT INTO organisations (id, payload) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET payload = $2",
      [id, JSON.stringify(full)]
    )
    return full
  }

  async listFiles(orgId?: string): Promise<FileEntry[]> {
    let query = "SELECT payload FROM files"
    const params: unknown[] = []
    if (orgId) {
      query += " WHERE (payload->>'orgId') = $1"
      params.push(orgId)
    }
    const res = await this.pool.query(query, params)
    return res.rows.map((r) => r.payload as FileEntry)
  }

  async getFile(id: string): Promise<FileEntry | null> {
    const res = await this.pool.query("SELECT payload FROM files WHERE (payload->>'id') = $1", [id])
    if (res.rowCount === 0) return null
    return res.rows[0].payload as FileEntry
  }

  async createFile(file: Omit<FileEntry, "id" | "uploadedAt">): Promise<FileEntry> {
    const id = generateId("file")
    const now = NOW()
    const full: FileEntry = { ...file, id, uploadedAt: now, version: 1 }
    await this.pool.query(
      "INSERT INTO files (id, payload) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET payload = $2",
      [id, JSON.stringify(full)]
    )
    return full
  }

  async createFileVersion(version: Omit<FileVersion, "id">): Promise<FileVersion> {
    const id = generateId("ver")
    const full: FileVersion = { ...version, id }
    await this.pool.query(
      "INSERT INTO file_versions (id, file_id, version, payload) VALUES ($1, $2, $3, $4)",
      [id, version.fileId, version.version, JSON.stringify(full)]
    )
    await this.pool.query(
      "UPDATE files SET version = $1, latest_version_id = $2 WHERE id = $3",
      [full.version, full.id, version.fileId]
    )
    return full
  }

  async getFileVersions(fileId: string): Promise<FileVersion[]> {
    const res = await this.pool.query(
      "SELECT payload FROM file_versions WHERE file_id = $1 ORDER BY version ASC",
      [fileId]
    )
    return res.rows.map((r) => r.payload as FileVersion)
  }

  private rowToRecord(row: Record<string, unknown>): FieldRecord {
    const geom = row.geom as unknown as { coordinates: [number, number] } | null
    return {
      sample_id: String(row.sample_id ?? ""),
      latitude: Number(row.latitude ?? 0),
      longitude: Number(row.longitude ?? 0),
      date: String(row.date ?? ""),
      host_crop: (row.host_crop ?? "other") as FieldRecord["host_crop"],
      diagnostic_status: (row.diagnostic_status ?? "Susceptible") as FieldRecord["diagnostic_status"],
      vector_density: Number(row.vector_density ?? 0),
      survey_effort: Number(row.survey_effort ?? 0),
      org_id: String(row.org_id ?? ""),
      submitted_by: String(row.submitted_by ?? ""),
      notes: (row.notes as string | null) ?? undefined,
      geometry: geom ? { type: "Point", coordinates: geom.coordinates } : undefined,
    }
  }

  async listObservations(orgId?: string): Promise<FieldRecord[]> {
    let query = "SELECT * FROM observations"
    const params: unknown[] = []
    if (orgId) {
      query += " WHERE org_id = $1"
      params.push(orgId)
    }
    query += " ORDER BY date DESC"
    const res = await this.pool.query(query, params)
    return res.rows.map((r) => this.rowToRecord(r))
  }

  async createObservation(record: Omit<FieldRecord, "geometry">): Promise<FieldRecord> {
    const id = generateId("obs")
    const now = NOW()
    await this.pool.query(
      `INSERT INTO observations (
        id, sample_id, latitude, longitude, date, host_crop, diagnostic_status,
        vector_density, survey_effort, org_id, submitted_by, notes, geom, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, ST_SetSRID(ST_MakePoint($13,$14),4326), $15)`,
      [
        id, record.sample_id, record.latitude, record.longitude, record.date,
        record.host_crop, record.diagnostic_status, record.vector_density,
        record.survey_effort, record.org_id, record.submitted_by, record.notes ?? null,
        record.longitude, record.latitude, now,
      ]
    )
    const full: FieldRecord = {
      ...record,
      geometry: { type: "Point", coordinates: [record.longitude, record.latitude] },
    }
    return full
  }

  async ingestObservations(records: Array<Omit<FieldRecord, "geometry">>): Promise<FieldIngestionResult> {
    const accepted: FieldRecord[] = []
    const rejected: Array<{ record: Record<string, unknown>; errors: string[] }> = []

    for (const raw of records) {
      const errors: string[] = []
      if (!raw.sample_id) errors.push("sample_id is required")
      if (raw.latitude == null || raw.latitude < -90 || raw.latitude > 90) errors.push("latitude out of range")
      if (raw.longitude == null || raw.longitude < -180 || raw.longitude > 180) errors.push("longitude out of range")
      if (!raw.date) errors.push("date is required")
      if (!raw.host_crop) errors.push("host_crop is required")
      if (!raw.diagnostic_status) errors.push("diagnostic_status is required")
      if (raw.vector_density == null || raw.vector_density < 0) errors.push("vector_density must be >= 0")
      if (raw.survey_effort == null || raw.survey_effort <= 0) errors.push("survey_effort must be > 0")
      if (!raw.org_id) errors.push("org_id is required")
      if (!raw.submitted_by) errors.push("submitted_by is required")

      if (errors.length) {
        rejected.push({ record: raw as Record<string, unknown>, errors })
        continue
      }
      await this.createObservation(raw)
      accepted.push({ ...raw, geometry: { type: "Point", coordinates: [raw.longitude, raw.latitude] } })
    }

    return {
      accepted,
      rejected,
      total: records.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
    }
  }
}

