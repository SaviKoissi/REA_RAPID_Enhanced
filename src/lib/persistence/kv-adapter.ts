import fs from "fs"
import path from "path"
import type { PersistenceAdapter } from "./adapter"
import type {
  DashboardEntry,
  FieldRecord,
  InferenceRun,
  ScenarioResult,
  UncertaintyField,
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

  async deleteDashboard(key: string): Promise<void> {
    const store = readStore()
    delete store.dashboards[key]
    writeStore(store)
  }

  async listObservations(orgId?: string): Promise<FieldRecord[]> {
    const store = readStore()
    if (!orgId) return store.observations
    return store.observations.filter((o) => o.orgId === orgId)
  }

  async saveObservations(records: FieldRecord[]): Promise<void> {
    const store = readStore()
    const byId = new Map(store.observations.map((r) => [r.id, r]))
    for (const r of records) {
      const id = r.id || (r as unknown as { sample_id?: string }).sample_id || String(byId.size + 1)
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
}
