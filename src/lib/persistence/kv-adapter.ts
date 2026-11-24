import fs from "fs"
import path from "path"
import type { PersistenceAdapter } from "./adapter"
import type {
  DashboardEntry,
  FileEntry,
  FieldIngestionResult,
  FieldRecord,
  FileVersion,
  InferenceRun,
  Organisation,
  ScenarioResult,
  UncertaintyField,
  User,
} from "@/types"

const STORE_FILE = path.join(process.cwd(), ".data", "rapid-kv-store.json")

interface StoreShape {
  dashboards: Record<string, DashboardEntry>
  observations: FieldRecord[]
  inferenceRuns: Record<string, InferenceRun>
  scenarios: Record<string, ScenarioResult>
  uncertaintyFields: Record<string, UncertaintyField>
}

function emptyStore(): StoreShape {
  return {
    dashboards: {},
    observations: [],
    inferenceRuns: {},
    scenarios: {},
    uncertaintyFields: {},
  }
}

function readStore(): StoreShape {
  try {
    if (!fs.existsSync(STORE_FILE)) return emptyStore()
    const raw = fs.readFileSync(STORE_FILE, "utf8")
    if (!raw.trim()) return emptyStore()
    const parsed = JSON.parse(raw)
    return {
      ...emptyStore(),
      ...(parsed && typeof parsed === "object" ? parsed : {}),
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: StoreShape): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true })
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8")
}

export class KVAdapter implements PersistenceAdapter {
  private dashboards = new Map<string, DashboardEntry>()
  private users = new Map<string, User>()
  private orgs = new Map<string, Organisation>()
  private files = new Map<string, FileEntry>()
  private versions = new Map<string, FileVersion[]>()
  private observations = new Map<string, FieldRecord[]>()
  async listDashboards(orgId?: string): Promise<DashboardEntry[]> {
    const store = readStore()
    const all = Object.values(store.dashboards)
    if (!orgId) return all
    return all.filter(
      (d) =>
        d.permissions?.orgId === orgId ||
        (d as unknown as { orgId?: string }).orgId === orgId
    )
  }

  async getDashboard(key: string): Promise<DashboardEntry | null> {
    const store = readStore()
    return store.dashboards[key] ?? null
  }

  async createDashboard(
    input: Omit<DashboardEntry, "key" | "createdAt" | "updatedAt">
  ): Promise<DashboardEntry> {
    const store = readStore()
    const now = new Date().toISOString()
    const slug = (input.metadata?.name || "dashboard")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    const key = `dash_${slug || "view"}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`
    const entry: DashboardEntry = {
      ...(input as DashboardEntry),
      key,
      createdAt: now,
      updatedAt: now,
    }
    store.dashboards[key] = entry
    writeStore(store)
    return entry
  }

  async saveDashboard(entry: DashboardEntry): Promise<void> {
    const store = readStore()
    const now = new Date().toISOString()
    store.dashboards[entry.key] = {
      ...entry,
      createdAt: entry.createdAt || now,
      updatedAt: now,
    }
    writeStore(store)
  }

  async updateDashboard(key: string, patch: Partial<DashboardEntry>): Promise<DashboardEntry> {
    const store = readStore()
    const existing = store.dashboards[key]
    if (!existing) throw new Error(`Dashboard ${key} not found`)
    const now = new Date().toISOString()
    const updated: DashboardEntry = {
      ...existing,
      ...patch,
      key,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    }
    store.dashboards[key] = updated
    writeStore(store)
    return updated
  }

  async deleteDashboard(key: string): Promise<void> {
    const store = readStore()
    delete store.dashboards[key]
    writeStore(store)
  }

  async listObservations(orgId?: string): Promise<FieldRecord[]> {
    const store = readStore()
    if (!orgId) return store.observations
    return store.observations.filter((o) => o.org_id === orgId)
  }

  async saveObservations(records: FieldRecord[]): Promise<void> {
    const store = readStore()
    const byId = new Map(store.observations.map((r) => [r.sample_id, r]))
    for (const r of records) {
      const id = r.sample_id || String(byId.size + 1)
      byId.set(id, { ...r, id })
    }
    store.observations = Array.from(byId.values())
    writeStore(store)
  }

  async listInferenceRuns(orgId?: string): Promise<InferenceRun[]> {
    const store = readStore()
    const all = Object.values(store.inferenceRuns)
    if (!orgId) return all
    return all.filter((r) => (r as unknown as { orgId?: string }).orgId === orgId)
  }

  async saveInferenceRun(run: InferenceRun): Promise<void> {
    const store = readStore()
    store.inferenceRuns[run.id] = run
    writeStore(store)
  }

  async listScenarios(orgId?: string): Promise<ScenarioResult[]> {
    const store = readStore()
    const all = Object.values(store.scenarios)
    if (!orgId) return all
    return all.filter((s) => (s as unknown as { orgId?: string }).orgId === orgId)
  }

  async saveScenario(scenario: ScenarioResult): Promise<void> {
    const store = readStore()
    store.scenarios[scenario.id] = scenario
    writeStore(store)
  }

  async listUncertaintyFields(orgId?: string): Promise<UncertaintyField[]> {
    const store = readStore()
    const all = Object.values(store.uncertaintyFields)
    if (!orgId) return all
    return all.filter((u) => (u as unknown as { orgId?: string }).orgId === orgId)
  }

  async saveUncertaintyField(field: UncertaintyField): Promise<void> {
    const store = readStore()
    store.uncertaintyFields[field.id] = field
    writeStore(store)
  }

  // ---- Users / auth ----
  async getUserByEmail(email: string): Promise<User | null> {
    const store = readStore()
    return (store as unknown as { users?: User[] }).users?.find((u) => u.email === email) ?? null
  }
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null
  }
  async createUser(user: Omit<User, "id">): Promise<User> {
    const id = `user_${crypto.randomUUID()}`
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

  // ---- Organisations ----
  async listOrganisations(): Promise<Organisation[]> {
    return Array.from(this.orgs.values())
  }
  async getOrganisation(id: string): Promise<Organisation | null> {
    return this.orgs.get(id) ?? null
  }
  async createOrganisation(org: Omit<Organisation, "id" | "createdAt" | "members">): Promise<Organisation> {
    const id = `org_${crypto.randomUUID()}`
    const full: Organisation = { ...org, id, createdAt: new Date().toISOString(), members: [] }
    this.orgs.set(id, full)
    return full
  }

  // ---- Files ----
  async listFiles(orgId?: string): Promise<FileEntry[]> {
    const all = Array.from(this.files.values())
    return orgId ? all.filter((f) => f.orgId === orgId) : all
  }
  async getFile(id: string): Promise<FileEntry | null> {
    return this.files.get(id) ?? null
  }
  async createFile(file: Omit<FileEntry, "id" | "uploadedAt">): Promise<FileEntry> {
    const id = `file_${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const full: FileEntry = { ...file, id, uploadedAt: now, version: 1 }
    this.files.set(id, full)
    this.versions.set(id, [])
    return full
  }
  async createFileVersion(version: Omit<FileVersion, "id">): Promise<FileVersion> {
    const id = `ver_${crypto.randomUUID()}`
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

  // ---- Field observatory ----
  async createObservation(record: Omit<FieldRecord, "geometry">): Promise<FieldRecord> {
    const full: FieldRecord = {
      ...record,
      id: record.sample_id,
      geometry: {
        type: "Point",
        coordinates: [record.longitude, record.latitude],
      },
    }
    const list = this.observations.get(record.org_id) ?? []
    list.push(full)
    this.observations.set(record.org_id, list)
    const store = readStore()
    store.observations = Array.from(this.observations.values()).flat()
    writeStore(store)
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
    try {
      const store = readStore()
      return !!store
    } catch {
      return false
    }
  }
}
