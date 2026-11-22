import { PersistenceAdapter } from "./adapter"
import type {
  DashboardEntry,
  Phase,
  User,
  Organisation,
  FileEntry,
  FileVersion,
  FieldRecord,
  FieldIngestionResult,
} from "@/types"

const NOW = () => new Date().toISOString()

function generateId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`
}

export class KVAdapter implements PersistenceAdapter {
  private dashboards = new Map<string, DashboardEntry>()
  private users = new Map<string, User>()
  private orgs = new Map<string, Organisation>()
  private files = new Map<string, FileEntry>()
  private versions = new Map<string, FileVersion[]>()
  private observations = new Map<string, FieldRecord[]>()


  private kvRestUrl?: string
  private kvToken?: string

  constructor() {
    this.kvRestUrl = process.env.KV_NAMESPACE_REST_URL
    this.kvToken = process.env.KV_AUTH_TOKEN
    this.seed()
  }

  private async kvRequest(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.kvRestUrl || !this.kvToken) return null
    const res = await fetch(`${this.kvRestUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.kvToken}`, ...init.headers },
    })
    if (!res.ok) return null
    return (await res.json()) as unknown
  }

  private seed() {
    const orgId = "org_wave_001"
    this.orgs.set(orgId, {
      id: orgId,
      name: "WAVE Biosecurity Organisation",
      pathosystem: ["CBSD", "BBTD"],
      members: [],
      createdAt: NOW(),
    })

    const userId = "user_admin_001"
    this.users.set(userId, {
      id: userId,
      email: "admin@wave.org",
      name: "Wave Administrator",
      role: "epidemiologist",
      orgId,
      language: "en",
      credentials: ["owner", "editor"],
    })

    const now = NOW()
    const phases: Array<{ phase: number; name: string; pathosystem: Pathosystem }> = [
      { phase: 1, name: "CBSD initial detection", pathosystem: "CBSD" },
      { phase: 2, name: "CBSD delimitation surveys", pathosystem: "CBSD" },
      { phase: 3, name: "CBSD risk map", pathosystem: "CBSD" },
      { phase: 4, name: "CBSD no intervention scenario", pathosystem: "CBSD" },
      { phase: 5, name: "CBSD management interventions", pathosystem: "CBSD" },
      { phase: 1, name: "BBTD delimiting surveys", pathosystem: "BBTD" },
      { phase: 3, name: "BBTD Current spread", pathosystem: "BBTD" },
      { phase: 4, name: "BBTD Future spread, no control", pathosystem: "BBTD" },
      { phase: 5, name: "BBTD Future spread, controls", pathosystem: "BBTD" },
    ]

    let counter = 0
    for (const p of phases) {
      const key = `dashboard_${crypto.randomUUID()}`
      const entry: DashboardEntry = {
        key,
        metadata: {
          name: p.name,
          description: `Analytical view for ${p.name}`,
          pathosystem: p.pathosystem,
          language: "en",
          phase: p.phase as Phase,
        },
        permissions: {
          orgId,
          permissionType: "org",
          permissionLevel: "owner",
          userId,
        },
        layers: [],
        modelState: {
          viewport: { center: [-1.5, -20], zoom: 4 },
          activeLayers: [],
          posteriors: [],
          uncertaintyCartography: { enabled: false, method: "kriging", confidence: 0.95 },
          scenarioComparison: { enabled: false, scenarioIds: [] },
        },
        createdAt: now,
        updatedAt: now,
        ownerId: userId,
        orgId,
      }
      this.dashboards.set(key, entry)
      counter++
    }
  }

  async listDashboards(orgId?: string): Promise<DashboardEntry[]> {
    const entries = Array.from(this.dashboards.values())
    return orgId ? entries.filter((d) => d.orgId === orgId) : entries
  }

  async getDashboard(key: string): Promise<DashboardEntry | null> {
    return this.dashboards.get(key) ?? null
  }

  async createDashboard(entry: Omit<DashboardEntry, "key" | "createdAt" | "updatedAt">): Promise<DashboardEntry> {
    const key = `dashboard_${crypto.randomUUID()}`
    const now = NOW()
    const full: DashboardEntry = { ...entry, key, createdAt: now, updatedAt: now }
    this.dashboards.set(key, full)
    await this.kvRequest(`/keys/${key}`, {
      method: "PUT",
      body: JSON.stringify(full),
    })
    return full
  }

  async updateDashboard(key: string, patch: Partial<DashboardEntry>): Promise<DashboardEntry> {
    const existing = this.dashboards.get(key)
    if (!existing) throw new Error(`Dashboard ${key} not found`)
    const updated: DashboardEntry = { ...existing, ...patch, key, updatedAt: NOW() }
    this.dashboards.set(key, updated)
    await this.kvRequest(`/keys/${key}`, {
      method: "PUT",
      body: JSON.stringify(updated),
    })
    return updated
  }

  async deleteDashboard(key: string): Promise<void> {
    this.dashboards.delete(key)
    await this.kvRequest(`/keys/${key}`, { method: "DELETE" })
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return Array.from(this.users.values()).find((u) => u.email === email) ?? null
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null
  }

  async createUser(user: Omit<User, "id">): Promise<User> {
    const id = generateId("user")
    const full: User = { ...user, id }
    this.users.set(id, full)
    return full
  }

  async updateUser(id: string, patch: Partial<User>): Promise<User> {
    const existing = this.users.get(id)
    if (!existing) throw new Error(`User ${id} not found`)
    const updated: User = { ...existing, ...patch }
    this.users.set(id, updated)
    return updated
  }

  async listOrganisations(): Promise<Organisation[]> {
    return Array.from(this.orgs.values())
  }

  async getOrganisation(id: string): Promise<Organisation | null> {
    return this.orgs.get(id) ?? null
  }

  async createOrganisation(org: Omit<Organisation, "id" | "createdAt" | "members">): Promise<Organisation> {
    const id = generateId("org")
    const full: Organisation = { ...org, id, createdAt: NOW(), members: [] }
    this.orgs.set(id, full)
    return full
  }

  async listFiles(orgId?: string): Promise<FileEntry[]> {
    const entries = Array.from(this.files.values())
    return orgId ? entries.filter((f) => f.orgId === orgId) : entries
  }

  async getFile(id: string): Promise<FileEntry | null> {
    return this.files.get(id) ?? null
  }

  async createFile(file: Omit<FileEntry, "id" | "uploadedAt">): Promise<FileEntry> {
    const id = generateId("file")
    const now = NOW()
    const full: FileEntry = { ...file, id, uploadedAt: now, version: 1 }
    this.files.set(id, full)
    this.versions.set(id, [])
    return full
  }

  async createFileVersion(version: Omit<FileVersion, "id">): Promise<FileVersion> {
    const id = generateId("ver")
    const full: FileVersion = { ...version, id }
    const list = this.versions.get(version.fileId) ?? []
    list.push(full)
    this.versions.set(version.fileId, list)
    const file = this.files.get(version.fileId)
    if (file) {
      file.version = full.version
      file.latestVersionId = full.id
      this.files.set(version.fileId, file)
    }
    return full
  }

  async getFileVersions(fileId: string): Promise<FileVersion[]> {
    return this.versions.get(fileId) ?? []
  }

  async listObservations(orgId?: string): Promise<FieldRecord[]> {
    const all = Array.from(this.observations.values()).flat()
    return orgId ? all.filter((o) => o.org_id === orgId) : all
  }

  async createObservation(record: Omit<FieldRecord, "geometry">): Promise<FieldRecord> {
    const full: FieldRecord = {
      ...record,
      geometry: {
        type: "Point",
        coordinates: [record.longitude, record.latitude],
      },
    }
    const list = this.observations.get(record.org_id) ?? []
    list.push(full)
    this.observations.set(record.org_id, list)
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

  async health(): Promise<boolean> {
    return true
  }
}

type Pathosystem = "CBSD" | "BBTD"
