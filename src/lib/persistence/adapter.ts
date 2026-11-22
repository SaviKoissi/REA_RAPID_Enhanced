import type {
  DashboardEntry,
  User,
  Organisation,
  FileEntry,
  FileVersion,
  FieldRecord,
  FieldIngestionResult,
} from "@/types"

export interface PersistenceAdapter {
  // Dashboards (KV-like registry)
  listDashboards(orgId?: string): Promise<DashboardEntry[]>
  getDashboard(key: string): Promise<DashboardEntry | null>
  createDashboard(entry: Omit<DashboardEntry, "key" | "createdAt" | "updatedAt">): Promise<DashboardEntry>
  updateDashboard(key: string, patch: Partial<DashboardEntry>): Promise<DashboardEntry>
  deleteDashboard(key: string): Promise<void>
  // Users / auth
  getUserByEmail(email: string): Promise<User | null>
  getUser(id: string): Promise<User | null>
  createUser(user: Omit<User, "id">): Promise<User>
  updateUser(id: string, patch: Partial<User>): Promise<User>
  // Organisations
  listOrganisations(): Promise<Organisation[]>
  getOrganisation(id: string): Promise<Organisation | null>
  createOrganisation(org: Omit<Organisation, "id" | "createdAt" | "members">): Promise<Organisation>
  // Files
  listFiles(orgId?: string): Promise<FileEntry[]>
  getFile(id: string): Promise<FileEntry | null>
  createFile(file: Omit<FileEntry, "id" | "uploadedAt">): Promise<FileEntry>
  createFileVersion(version: Omit<FileVersion, "id">): Promise<FileVersion>
  getFileVersions(fileId: string): Promise<FileVersion[]>
  // Field observatory records
  listObservations(orgId?: string): Promise<FieldRecord[]>
  createObservation(record: Omit<FieldRecord, "geometry">): Promise<FieldRecord>
  ingestObservations(records: Array<Omit<FieldRecord, "geometry">>): Promise<FieldIngestionResult>
  health(): Promise<boolean>
}
