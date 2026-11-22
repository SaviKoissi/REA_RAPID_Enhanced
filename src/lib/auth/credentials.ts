import type { User, Role, PermissionLevel } from "@/types"

export const ROLE_PERMISSIONS: Record<Role, { level: PermissionLevel; scopes: string[] }> = {
  field_scout: { level: "viewer", scopes: ["dashboards:read", "files:read", "files:upload"] },
  epidemiologist: { level: "editor", scopes: ["dashboards:read", "dashboards:write", "files:read", "files:write", "epi:compute"] },
  policy_maker: { level: "owner", scopes: ["dashboards:read", "dashboards:write", "dashboards:delete", "files:read", "files:write", "org:manage", "epi:compute", "scenario:compare"] },
}

export function can(role: Role, scope: string): boolean {
  return ROLE_PERMISSIONS[role]?.scopes.includes(scope) ?? false
}

export function roleLevel(role: Role): PermissionLevel {
  return ROLE_PERMISSIONS[role]?.level ?? "viewer"
}

export interface CredentialAuthResult {
  user: User | null
  error: string | null
}

export async function authenticate(
  email: string,
  password: string,
  getUserByEmail: (email: string) => Promise<User | null>,
  verifyPassword: (password: string, hash: string) => Promise<boolean>
): Promise<CredentialAuthResult> {
  const user = await getUserByEmail(email)
  if (!user) return { user: null, error: "Invalid credentials" }
  const ok = await verifyPassword(password, user.credentials?.[0] ?? "password")
  if (!ok) return { user: null, error: "Invalid credentials" }
  return { user, error: null }
}

export function hashPasswordStub(password: string): string {
  // In production use bcrypt/argon2. This is a deterministic stub for credential flow.
  return `stub_${Buffer.from(password).toString("base64")}`
}
