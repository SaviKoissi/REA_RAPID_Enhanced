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
  LayerRef,
  PosteriorRef,
  MapViewport,
  ModelState,
} from "@/types"

const NOW = () => new Date().toISOString()

function generateId(prefix = "id") {
  return `${prefix}_${safeUUID()}`
}

/* Deterministic LCG for reproducible synthetic data. */
let seedState = 20240601
function lcg(): number {
  seedState = (seedState * 1664525 + 1013904223) >>> 0
  return seedState / 0xffffffff
}
function lcgRange(min: number, max: number): number {
  return min + lcg() * (max - min)
}

function makeLayer(id: string, type: "raster" | "vector", name: string, visible = true, opacity = 0.6, url?: string): LayerRef {
  return { id, type, name, visible, opacity, ...(url ? { url } : {}) }
}

function makePosterior(id: string, method: "ABC-SMC" | "Stan", artifactUrl: string): PosteriorRef {
  return { id, method, artifactUrl, createdAt: NOW() }
}

function hostDensityCells(
  center: [number, number],
  count: number,
  spread: number,
  baseValue: number,
): Array<{ lat: number; lon: number; value: number }> {
  const cells: Array<{ lat: number; lon: number; value: number }> = []
  for (let i = 0; i < count; i++) {
    cells.push({
      lat: center[0] + (lcg() - 0.5) * 2 * spread,
      lon: center[1] + (lcg() - 0.5) * 2 * spread,
      value: Math.max(0, baseValue + (lcg() - 0.5) * 0.6),
    })
  }
  return cells
}

function surveyPoints(
  center: [number, number],
  nPositive: number,
  nNegative: number,
  startIso: string,
  pathosystem: Pathosystem,
): Array<{
  id: string
  lat: number
  lon: number
  positive: boolean
  date: string
  sampleId: string
  hostCrop: import("@/types").HostCrop
}> {
  const points: Array<{
    id: string
    lat: number
    lon: number
    positive: boolean
    date: string
    sampleId: string
    hostCrop: import("@/types").HostCrop
  }> = []
  const hostCrop: import("@/types").HostCrop =
    pathosystem === "CBSD" ? "cassava" : "banana"
  const base = new Date(startIso).getTime()
  for (let i = 0; i < nPositive; i++) {
    const d = new Date(base + i * 86400000 * 3).toISOString()
    points.push({
      id: `sp_${safeUUID()}`,
      lat: center[0] + (lcg() - 0.5) * 0.4,
      lon: center[1] + (lcg() - 0.5) * 0.4,
      positive: true,
      date: d,
      sampleId: `${pathosystem}-POS-${String(i + 1).padStart(3, "0")}`,
      hostCrop,
    })
  }
  for (let i = 0; i < nNegative; i++) {
    const d = new Date(base + i * 86400000 * 3).toISOString()
    points.push({
      id: `sp_${safeUUID()}`,
      lat: center[0] + (lcg() - 0.5) * 0.8,
      lon: center[1] + (lcg() - 0.5) * 0.8,
      positive: false,
      date: d,
      sampleId: `${pathosystem}-NEG-${String(i + 1).padStart(3, "0")}`,
      hostCrop,
    })
  }
  return points
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

    /* ---- Synthetic spatial layers per pathosystem ---- */
    const cbsdCenter: [number, number] = [7.8, 9.0] // Nigeria
    const bbtdCenter: [number, number] = [2.3, 7.2] // Benin

    const cbsdHostCells = hostDensityCells(cbsdCenter, 60, 1.6, 0.55)
    const bbtdHostCells = hostDensityCells(bbtdCenter, 45, 1.2, 0.5)

    const cbsdPoints = surveyPoints(cbsdCenter, 8, 12, "2024-01-10", "CBSD")
    const bbtdPoints = surveyPoints(bbtdCenter, 6, 10, "2024-02-01", "BBTD")

    const cbsdRaster: LayerRef = makeLayer(
      "cbsd_host_density",
      "raster",
      "CBSD host density (cassava, SPAM)",
      true,
      0.55,
      "/rasters/cbsd_host_density.tif",
    )
    const bbtdRaster: LayerRef = makeLayer(
      "bbtd_host_density",
      "raster",
      "BBTD host density (Musa, SPAM)",
      true,
      0.55,
      "/rasters/bbtd_host_density.tif",
    )

    const cbsdSurvey: LayerRef = makeLayer(
      "cbsd_surveys",
      "vector",
      "CBSD delimitation surveys",
      true,
      0.9,
    )
    const bbtdSurvey: LayerRef = makeLayer(
      "bbtd_surveys",
      "vector",
      "BBTD delimiting surveys",
      true,
      0.9,
    )

    const cbsdRisk: LayerRef = makeLayer(
      "cbsd_risk_contours",
      "raster",
      "CBSD ABC-SMC prevalence risk",
      false,
      0.5,
      "/rasters/cbsd_risk.tif",
    )
    const bbtdSpread: LayerRef = makeLayer(
      "bbtd_spread",
      "raster",
      "BBTD spread forecast",
      false,
      0.5,
      "/rasters/bbtd_spread.tif",
    )

    const cbsdControls: LayerRef = makeLayer(
      "cbsd_interventions",
      "vector",
      "CBSD management interventions",
      false,
      0.7,
    )
    const bbtdControls: LayerRef = makeLayer(
      "bbtd_controls",
      "vector",
      "BBTD clean-seed/roguing controls",
      false,
      0.7,
    )

    const adminBounds: LayerRef = makeLayer(
      "admin_boundaries",
      "vector",
      "Admin boundaries",
      true,
      0.3,
      "/boundaries/west_africa_admin.geojson",
    )

    const phases: Array<{
      phase: number
      name: string
      pathosystem: Pathosystem
      center: [number, number]
      zoom: number
      layers: LayerRef[]
      activeLayers: string[]
      posteriors: PosteriorRef[]
      uncertaintyCartography: ModelState["uncertaintyCartography"]
      scenarioComparison: ModelState["scenarioComparison"]
      points: Array<{
        id: string
        lat: number
        lon: number
        positive: boolean
        date: string
        sampleId: string
        hostCrop: import("@/types").HostCrop
      }>
    }> = [
      {
        phase: 1,
        name: "CBSD initial detection",
        pathosystem: "CBSD",
        center: cbsdCenter,
        zoom: 6,
        layers: [cbsdRaster, cbsdSurvey, adminBounds],
        activeLayers: ["cbsd_host_density", "cbsd_surveys", "admin_boundaries"],
        posteriors: [makePosterior("post_cbsd_1", "ABC-SMC", "/artifacts/cbsd_detection_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.9 },
        scenarioComparison: { enabled: false, scenarioIds: [] },
        points: cbsdPoints.slice(0, 8),
      },
      {
        phase: 2,
        name: "CBSD delimitation surveys",
        pathosystem: "CBSD",
        center: cbsdCenter,
        zoom: 7,
        layers: [cbsdRaster, cbsdSurvey, adminBounds],
        activeLayers: ["cbsd_host_density", "cbsd_surveys", "admin_boundaries"],
        posteriors: [makePosterior("post_cbsd_2", "ABC-SMC", "/artifacts/cbsd_delimitation_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.9 },
        scenarioComparison: { enabled: false, scenarioIds: [] },
        points: cbsdPoints,
      },
      {
        phase: 3,
        name: "CBSD risk map",
        pathosystem: "CBSD",
        center: cbsdCenter,
        zoom: 6,
        layers: [cbsdRaster, cbsdRisk, cbsdSurvey, adminBounds],
        activeLayers: ["cbsd_host_density", "cbsd_risk_contours", "admin_boundaries"],
        posteriors: [makePosterior("post_cbsd_3", "ABC-SMC", "/artifacts/cbsd_risk_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.95 },
        scenarioComparison: { enabled: false, scenarioIds: [] },
        points: cbsdPoints,
      },
      {
        phase: 4,
        name: "CBSD no intervention scenario",
        pathosystem: "CBSD",
        center: cbsdCenter,
        zoom: 6,
        layers: [cbsdRaster, cbsdRisk, adminBounds],
        activeLayers: ["cbsd_host_density", "cbsd_risk_contours", "admin_boundaries"],
        posteriors: [makePosterior("post_cbsd_4", "ABC-SMC", "/artifacts/cbsd_nocontrol_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.95 },
        scenarioComparison: {
          enabled: true,
          scenarioIds: ["scen_cbsd_nocontrol", "scen_cbsd_controls"],
        },
        points: cbsdPoints,
      },
      {
        phase: 5,
        name: "CBSD management interventions",
        pathosystem: "CBSD",
        center: cbsdCenter,
        zoom: 6,
        layers: [cbsdRaster, cbsdControls, cbsdSurvey, adminBounds],
        activeLayers: ["cbsd_host_density", "cbsd_interventions", "cbsd_surveys", "admin_boundaries"],
        posteriors: [makePosterior("post_cbsd_5", "ABC-SMC", "/artifacts/cbsd_control_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.95 },
        scenarioComparison: {
          enabled: true,
          scenarioIds: ["scen_cbsd_controls"],
        },
        points: cbsdPoints,
      },
      {
        phase: 1,
        name: "BBTD delimiting surveys",
        pathosystem: "BBTD",
        center: bbtdCenter,
        zoom: 7,
        layers: [bbtdRaster, bbtdSurvey, adminBounds],
        activeLayers: ["bbtd_host_density", "bbtd_surveys", "admin_boundaries"],
        posteriors: [makePosterior("post_bbtd_1", "ABC-SMC", "/artifacts/bbtd_delimiting_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.9 },
        scenarioComparison: { enabled: false, scenarioIds: [] },
        points: bbtdPoints.slice(0, 6),
      },
      {
        phase: 3,
        name: "BBTD Current spread",
        pathosystem: "BBTD",
        center: bbtdCenter,
        zoom: 7,
        layers: [bbtdRaster, bbtdSpread, bbtdSurvey, adminBounds],
        activeLayers: ["bbtd_host_density", "bbtd_spread", "admin_boundaries"],
        posteriors: [makePosterior("post_bbtd_3", "ABC-SMC", "/artifacts/bbtd_current_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.95 },
        scenarioComparison: { enabled: false, scenarioIds: [] },
        points: bbtdPoints,
      },
      {
        phase: 4,
        name: "BBTD Future spread, no control",
        pathosystem: "BBTD",
        center: bbtdCenter,
        zoom: 7,
        layers: [bbtdRaster, bbtdSpread, adminBounds],
        activeLayers: ["bbtd_host_density", "bbtd_spread", "admin_boundaries"],
        posteriors: [makePosterior("post_bbtd_4", "ABC-SMC", "/artifacts/bbtd_nocontrol_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.95 },
        scenarioComparison: {
          enabled: true,
          scenarioIds: ["scen_bbtd_nocontrol", "scen_bbtd_controls"],
        },
        points: bbtdPoints,
      },
      {
        phase: 5,
        name: "BBTD Future spread, controls",
        pathosystem: "BBTD",
        center: bbtdCenter,
        zoom: 7,
        layers: [bbtdRaster, bbtdControls, bbtdSurvey, adminBounds],
        activeLayers: ["bbtd_host_density", "bbtd_controls", "bbtd_surveys", "admin_boundaries"],
        posteriors: [makePosterior("post_bbtd_5", "ABC-SMC", "/artifacts/bbtd_control_posterior.json")],
        uncertaintyCartography: { enabled: true, method: "kriging", confidence: 0.95 },
        scenarioComparison: { enabled: true, scenarioIds: ["scen_bbtd_controls"] },
        points: bbtdPoints,
      },
    ]

    for (const p of phases) {
      const key = `dashboard_${safeUUID()}`
      const entry: DashboardEntry = {
        key,
        metadata: {
          name: p.name,
          description: `Analytical view for ${p.name} — ${p.pathosystem}`,
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
        layers: p.layers,
        modelState: {
          viewport: { center: p.center, zoom: p.zoom },
          activeLayers: p.activeLayers,
          posteriors: p.posteriors,
          uncertaintyCartography: p.uncertaintyCartography,
          scenarioComparison: p.scenarioComparison,
        },
        createdAt: now,
        updatedAt: now,
        ownerId: userId,
        orgId,
      }
      this.dashboards.set(key, entry)
    }

    /* ---- Pre-populate field observatory records ---- */
    const allPoints = [...cbsdPoints, ...bbtdPoints]
    allPoints.forEach((pt) => {
      const orgIdPt = orgId
      const rec: FieldRecord = {
        sample_id: pt.sampleId,
        latitude: pt.lat,
        longitude: pt.lon,
        date: pt.date,
        host_crop: pt.hostCrop,
        diagnostic_status: pt.positive ? "Infectious" : "Susceptible",
        vector_density: Math.round(lcgRange(1, 40) * 10) / 10,
        survey_effort: Math.round(lcgRange(10, 60)),
        org_id: orgIdPt,
        submitted_by: userId,
        notes: `Synthetic ${pt.hostCrop === "cassava" ? "CBSD" : "BBTD"} survey record`,
        geometry: { type: "Point", coordinates: [pt.lon, pt.lat] },
      }
      const list = this.observations.get(orgIdPt) ?? []
      list.push(rec)
      this.observations.set(orgIdPt, list)
    })

    /* ---- Pre-populate file artifacts ---- */
    const fileMeta: Array<{
      filename: string
      mimeType: string
      size: number
      type: "csv" | "geojson" | "raster" | "posterior" | "stan"
      metadata: Record<string, unknown>
    }> = [
      {
        filename: "field_survey_q3_2024.csv",
        mimeType: "text/csv",
        size: 1_245_000,
        type: "csv",
        metadata: { records: 340, pathosystem: "CBSD", region: "Nigeria" },
      },
      {
        filename: "delimitation_surveys.geojson",
        mimeType: "application/geo+json",
        size: 840_000,
        type: "geojson",
        metadata: { features: 210, pathosystem: "CBSD", region: "Nigeria" },
      },
      {
        filename: "host_crop_raster_cassava.tif",
        mimeType: "image/tiff",
        size: 45_000_000,
        type: "raster",
        metadata: { variable: "harvested_area", source: "SPAM s41597-020-0501-z", region: "Nigeria" },
      },
      {
        filename: "host_crop_raster_musa.tif",
        mimeType: "image/tiff",
        size: 38_000_000,
        type: "raster",
        metadata: { variable: "harvested_area", source: "SPAM s41597-020-0501-z", region: "Benin" },
      },
      {
        filename: "abc_smc_posterior_cbsd.json",
        mimeType: "application/json",
        size: 2_100_000,
        type: "posterior",
        metadata: { method: "ABC-SMC", pathosystem: "CBSD", generations: 6 },
      },
      {
        filename: "abc_smc_posterior_bbtd.json",
        mimeType: "application/json",
        size: 1_850_000,
        type: "posterior",
        metadata: { method: "ABC-SMC", pathosystem: "BBTD", generations: 5 },
      },
      {
        filename: "stan_model_cbsd.stan",
        mimeType: "text/plain",
        size: 15_000,
        type: "stan",
        metadata: { model: "SEIR_spatial", pathosystem: "CBSD" },
      },
    ]
    let fversion = 1
    for (const fm of fileMeta) {
      const fid = generateId("file")
      const nowF = NOW()
      const file: FileEntry = {
        id: fid,
        filename: fm.filename,
        mimeType: fm.mimeType,
        size: fm.size,
        type: fm.type,
        version: fversion,
        latestVersionId: generateId("ver"),
        uploadedBy: userId,
        uploadedAt: nowF,
        orgId,
        metadata: fm.metadata,
      }
      this.files.set(fid, file)
      const ver: FileVersion = {
        id: file.latestVersionId,
        fileId: fid,
        version: fversion,
        url: `/artifacts/${fm.filename}`,
        checksum: `sha256_${safeUUID().slice(0, 12)}`,
        uploadedAt: nowF,
        uploadedBy: userId,
        validated: true,
        validationErrors: [],
      }
      this.versions.set(fid, [ver])
      fversion++
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
    const key = `dashboard_${safeUUID()}`
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

type Pathosystem = "CBSD" | "BBTD"
