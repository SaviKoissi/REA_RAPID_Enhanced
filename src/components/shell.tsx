"use client"

import { useState, useEffect, useCallback } from "react"
import { TopNav } from "@/components/nav/top-nav"
import type { User } from "@/types"
import { Language } from "@/lib/i18n"

interface SessionState {
  user: User | null
  lang: Language
  isReady: boolean
}

export function ClientShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState>({ user: null, lang: "en", isReady: false })

  const loadSession = useCallback(async (): Promise<SessionState> => {
    try {
      const user: User = {
        id: "user_admin_001",
        email: "admin@wave.org",
        name: "Wave Administrator",
        role: "epidemiologist",
        orgId: "org_wave_001",
        language: "en",
        credentials: ["owner"],
      }
      return { user, lang: "en", isReady: true }
    } catch {
      return { user: null, lang: "en", isReady: true }
    }
  }, [])

  useEffect(() => {
    let mounted = true
    loadSession().then((s) => {
      if (mounted) setSession(s)
    })
    return () => {
      mounted = false
    }
  }, [loadSession])

  const setLang = useCallback((lang: Language) => {
    setSession((s) => ({ ...s, lang }))
  }, [])

  const onSignOut = useCallback(() => {
    setSession({ user: null, lang: session.lang, isReady: true })
  }, [session.lang])

  if (!session.isReady) {
    return <>{children}</>
  }

  return (
    <>
      <TopNav user={session.user} lang={session.lang} setLang={setLang} onSignOut={onSignOut} />
      <main className="flex-1 w-full">{children}</main>
    </>
  )
}
