import { NextResponse } from "next/server"
import { createAdapter } from "@/lib/persistence/factory"
import { authenticate, hashPasswordStub } from "@/lib/auth/credentials"
import { setSessionToken } from "@/lib/auth/session"
import { cookies } from "next/headers"

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


export async function POST(req: Request) {
  const { email, password } = await req.json()
  const adapter = createAdapter()
  const result = await authenticate(email, password, adapter.getUserByEmail.bind(adapter), async (pw, hash) => hash === hashPasswordStub(pw))
  if (!result.user) return NextResponse.json({ error: result.error }, { status: 401 })
  const token = `rapid_${safeUUID()}`
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  setSessionToken(token, expires)
  return NextResponse.json({ user: result.user, token })
}
