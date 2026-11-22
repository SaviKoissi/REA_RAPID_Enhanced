/* eslint-disable @typescript-eslint/no-explicit-any */

export type Phase = 1 | 2 | 3 | 4 | 5
export type Language = "en" | "fr"
export type PermissionLevel = "owner" | "editor" | "viewer"
export type PermissionType = "org" | "user"
export type Role = "field_scout" | "epidemiologist" | "policy_maker"
export type Pathosystem = "CBSD" | "BBTD"

export interface DashboardMetadata {
  name: string
  description: string
  pathosystem: Pathosystem
  language: Language
  phase: Phase
}

export interface DashboardPermissions {
  orgId: string
  permissionType: PermissionType
  permissionLevel: PermissionLevel
  userId: string
}

export interface MapViewport {
  center: [number, number]
  zoom: number
  bounds?: [[number, number], [number, number]]
}

export interface LayerRef {
  id: string
  type: "raster" | "vector"
  url?: string
  name: string
  visible: boolean
  opacity: number
}

export interface PosteriorRef {
  id: string
  method: "ABC-SMC" | "Stan"
  artifactUrl: string
  createdAt: string
}

export interface ModelState {
  viewport: MapViewport
  activeLayers: string[]
  posteriors: PosteriorRef[]
  uncertaintyCartography?: {
    enabled: boolean
    method: "kriging" | "idw" | "kernel"
    confidence: number
  }
  scenarioComparison?: {
    enabled: boolean
    scenarioIds: string[]
  }
}

export interface DashboardEntry {
  key: string // dashboard_<uuid>
  metadata: DashboardMetadata
  permissions: DashboardPermissions
  layers: LayerRef[]
  modelState: ModelState
  createdAt: string
  updatedAt: string
  ownerId: string
  orgId: string
}

export interface User {
  id: string
  email: string
  name: string
  role: Role
  orgId: string
  language: Language
  avatarUrl?: string
  credentials?: string[]
}

export interface Organisation {
  id: string
  name: string
  pathosystem: Pathosystem[]
  members: OrganisationMember[]
  createdAt: string
}

export interface OrganisationMember {
  userId: string
  role: Role
  permissionLevel: PermissionLevel
}

export interface FileEntry {
  id: string
  filename: string
  mimeType: string
  size: number
  type: "csv" | "geojson" | "raster" | "posterior" | "stan"
  version: number
  latestVersionId: string
  uploadedBy: string
  uploadedAt: string
  orgId: string
  metadata: Record<string, unknown>
}

export interface FileVersion {
  id: string
  fileId: string
  version: number
  url: string
  checksum: string
  uploadedAt: string
  uploadedBy: string
  validated: boolean
  validationErrors: string[]
}

export interface AuthSession {
  user: User | null
  token: string | null
  expiresAt: string | null
}

export interface ABCSMCResult {
  posteriorSamples: number[][]
  parameterNames: string[]
  acceptanceRate: number
  generations: number
  tolerance: number
  timestamp: string
}

export interface UncertaintyMap {
  id: string
  mean: number[][]
  variance: number[][]
  confidenceInterval: { lower: number[][]; upper: number[][] }
  bounds: [[number, number], [number, number]]
  method: string
}

export interface ScenarioComparison {
  id: string
  name: string
  scenarioIds: string[]
  metrics: Record<string, number[]>
  delta: Record<string, number>
  createdAt: string
}

/* ---------- Field observatory ingestion schema ---------- */

export type DiagnosticStatus = "Susceptible" | "Exposed" | "Infectious" | "Removed"
export type HostCrop = "cassava" | "banana" | "plantain" | "other"

export interface FieldRecord {
  sample_id: string
  latitude: number
  longitude: number
  date: string // ISO 8601
  host_crop: HostCrop
  diagnostic_status: DiagnosticStatus
  vector_density: number // per unit survey effort (e.g. whiteflies/plant or aphids/plant)
  survey_effort: number // e.g. number of plants sampled / transect length
  org_id: string
  submitted_by: string
  notes?: string
  geometry?: { type: "Point"; coordinates: [number, number] } // [lon, lat] GeoJSON
}

export interface FieldIngestionResult {
  accepted: FieldRecord[]
  rejected: Array<{ record: Record<string, unknown>; errors: string[] }>
  total: number
  accepted_count: number
  rejected_count: number
}

export interface HostLayerManifest {
  doi: string
  nature_url: string
  dataset: string
  crop: string
  variable: string
  variable_label: string
  region: string
  region_name: string
  bounds_wgs84: number[] // [west, south, east, north]
  epsg: number
  output_geotiff: string | null
  source_url: string | null
  status: string
  notes: string[]
  created_at: string
  purpose: string
}

/* ---------- Module 1: Initial Detection & Situational Awareness ---------- */

export type DetectionAlertLevel = "none" | "watch" | "alert" | "critical"

export interface SurveyPoint {
  id: string
  lat: number
  lon: number
  positive: boolean
  date: string // ISO 8601
  sampleId: string
  hostCrop: HostCrop
}

export interface HostCluster {
  id: string
  centroid: [number, number] // [lat, lon]
  hostDensity: number
  areaHa: number
  name: string
}

export interface DetectionMetrics {
  indexCase: SurveyPoint | null
  totalPoints: number
  positiveCount: number
  negativeCount: number
  detectionVelocity: number // confirmed positives per day
  daysSinceIndex: number
  distanceToNearestHostClusterKm: number
  nearestHostCluster: HostCluster | null
  alertLevel: DetectionAlertLevel
  clusterCentroids: HostCluster[]
}

export interface Module1MapLayers {
  positiveMarkers: Array<{ position: [number, number]; label: string }>
  negativeMarkers: Array<{ position: [number, number]; label: string }>
  hostClusters: HostCluster[]
  adminBoundsUrl?: string
  hostRasterUrl?: string
}

export interface Module1Output {
  metrics: DetectionMetrics
  mapLayers: Module1MapLayers
}

/* ---------- Module 2: Optimal Delimitation Surveillance Design ---------- */

export type DispersalKernel = "exponential" | "power_law" | "levy"

export interface SurveillanceConstraints {
  maxSamples: number // N_max
  gridResolutionKm: number // cell size
  travelCostWeight: number // 0..1
  sensitivity: number // Se
  specificity: number // Sp
  budgetCurrency?: string
  costPerSample?: number
}

export interface GridCell {
  id: string
  lat: number
  lon: number
  hostDensity: number
  distanceToNearestPositiveKm: number
  alreadySampled: boolean
  detectionProbability: number
  priorityScore: number
  selected: boolean
  travelCost: number
}

export interface Module2Output {
  grid: GridCell[]
  selectedCells: GridCell[]
  totalDetectionProbability: number
  expectedDetections: number
  constraints: SurveillanceConstraints
  exportGeoJson: string
  exportCsv: string
}

/* ---------- Module 3: Data Assimilation & Current Epidemic State ---------- */

export interface SEIRCompartment {
  S: number
  E: number
  I: number
  R: number
}

export interface GridNode {
  id: string
  lat: number
  lon: number
  seir: SEIRCompartment
  hostDensity: number
  prevalence: number
  ciLower: number
  ciUpper: number
  exceedanceProbability: number
}

export interface ABCSMCParameter {
  name: string
  priorMin: number
  priorMax: number
  posteriorMean: number
  posteriorMedian: number
  ciLower: number
  ciUpper: number
  ess: number
  samples: number[]
  priorSamples: number[] // prior draws for density comparison
  priorDensity: { x: number; y: number }[] // prior density curve
  posteriorDensity: { x: number; y: number }[] // posterior density curve
}

export interface DensityPoint {
  x: number
  y: number
}

export interface ABCSMCToleranceSchedule {
  generation: number
  epsilon: number
  acceptanceRate: number
  particleCount: number
}

export interface Module3Output {
  parameters: ABCSMCParameter[]
  toleranceSchedule: ABCSMCToleranceSchedule[]
  grid: GridNode[]
  medianPrevalenceMap: number[][] // raster-like grid
  ciLowerMap: number[][]
  ciUpperMap: number[][]
  exceedanceMap: number[][]
  bounds: [[number, number], [number, number]]
  essDiagnostics: Array<{ parameter: string; ess: number; passed: boolean }>
}

/* ---------- Module 4: Future Spread Forecasting & Intervention Scenarios ---------- */

export type ScenarioId = "no_control" | "management_interventions"

export interface InterventionLevers {
  surveillanceFrequency: number // surveys per month
  bufferRadiusKm: number // delimitation buffer around detected positives (km)
  roguingComplianceRate: number // 0..1 fraction of infected plants removed
  roguingResponseDelayDays: number // days from detection to removal
  cleanPlantingAdoptionRate: number // 0..1 fraction using certified material
  movementRestriction: boolean // phytosanitary quarantine zones active
  vectorControlEfficacy: number // 0..1 reduction in vector transmission
  vectorControlTimingDays: number // days after detection to apply vector control
}

export interface ProjectionTrajectory {
  timeStep: number // month index
  meanPrevalence: number
  ciLower: number
  ciUpper: number
  totalInfected: number
  newlyInfected: number
}

export interface ScenarioResult {
  id: ScenarioId
  name: string
  color: string // heatmap color
  levers: InterventionLevers
  trajectories: ProjectionTrajectory[]
  finalPrevalence: number
  totalCasesAvertedVsBaseline: number
  gridSnapshots: Array<{ timeStep: number; prevalence: number[] }> // per node prevalence at time step
}

export interface Module4Output {
  scenarios: ScenarioResult[]
  timeHorizonMonths: number
  nodeCount: number
  bounds: [[number, number], [number, number]]
  defaultLevers: InterventionLevers
}

/* ---------- Module 5: Economic Impact & FAO Cost-Effectiveness ---------- */

export interface FAOPrice {
  commodity: string
  farmGatePriceUSDPerTon: number
  source: "FAOSTAT" | "regional_market" | "user_defined"
  year: number
  country: string
}

export interface EconomicParameters {
  commodity: string
  potentialYieldTonsPerHa: number
  cultivatedAreaHa: number
  farmGatePriceUSDPerTon: number
  discountRate: number // annual, e.g. 0.08
  analysisHorizonYears: number
  country: string
}

export interface InterventionCost {
  lever: keyof InterventionLevers
  unitCostUSD: number
  unit: "per_ha" | "per_survey" | "per_plant" | "lump_sum"
  fixedCostUSD: number
}

export interface PortfolioResult {
  id: string
  name: string
  levers: InterventionLevers
  // Physical impacts (from Module 4 coupling)
  yieldLossTonsBaseline: number
  yieldLossTonsControlled: number
  yieldSavedTons: number
  // Economic impacts (FAO valuation)
  revenueLossBaselineUSD: number
  revenueLossControlledUSD: number
  revenueSavedUSD: number
  interventionCostUSD: number
  netBenefitUSD: number
  npvSavedUSD: number
  benefitCostRatio: number
  marginalCostUSDPerHaProtected: number
  // Pareto
  isParetoOptimal: boolean
}

export interface Module5Output {
  portfolios: PortfolioResult[]
  paretoFrontier: PortfolioResult[]
  economicParameters: EconomicParameters
  totalCultivatedAreaHa: number
  baselineNPVLossUSD: number
  bestBCRPortfolio: PortfolioResult | null
  bestNPVPortfolio: PortfolioResult | null
}

export interface ParetoPoint {
  x: number // cost USD
  y: number // benefit USD (NPV saved)
  portfolioId: string
  name: string
  bcr: number
}

export interface InterventionLeverControl {
  key: keyof InterventionLevers
  label: string
  unit: string
  min: number
  max: number
  step: number
}
