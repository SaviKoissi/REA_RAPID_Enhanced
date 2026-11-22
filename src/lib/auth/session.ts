import { cookies } from "next/headers"
import type { User } from "@/types"

const SESSION_COOKIE = "rapid_session"

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

export async function setSessionToken(token: string, expires: Date) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  })
}

export async function clearSessionToken() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export interface SessionUser extends User {
  token: string
}
