'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DealerOption } from '@/components/filters/types'

type UseSrsDealersResult = {
  dealers: DealerOption[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useSrsDealers(): UseSrsDealersResult {
  const [dealers, setDealers] = useState<DealerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dealers', { credentials: 'include' })
      const json = (await res.json().catch(() => ({}))) as {
        dealers?: DealerOption[]
        error?: string
        detail?: string
      }
      if (!res.ok) {
        throw new Error(json.error ?? json.detail ?? `HTTP ${res.status}`)
      }
      setDealers(json.dealers ?? [])
    } catch (err) {
      setDealers([])
      setError(err instanceof Error ? err.message : 'Failed to load dealers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { dealers, loading, error, reload: load }
}
