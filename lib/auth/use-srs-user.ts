'use client'

import { useEffect, useState } from 'react'
import type { SrsSessionUser } from './types'

export function useSrsUser() {
  const [user, setUser] = useState<SrsSessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' })
        if (!res.ok) {
          if (!cancelled) setUser(null)
          return
        }
        const json = await res.json()
        if (!cancelled && json.authenticated && json.user) {
          setUser(json.user as SrsSessionUser)
        }
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { user, loading }
}
