'use client'

import { useQuery } from '@tanstack/react-query'
import { useApiRequest } from '@/lib/hooks/use-api-request'
import { UrlEnum } from '@/types/enum-url'
import type { SrsSessionUser } from './types'

type SessionResponse = {
  authenticated?: boolean
  user?: SrsSessionUser
  error?: string
}

export const sessionQueryKey = ['auth', 'session'] as const

export function useSrsUser() {
  const apiRequest = useApiRequest<SrsSessionUser, undefined, SessionResponse>(
    UrlEnum.AUTH_SESSION,
  )

  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: async () => {
      try {
        const json = await apiRequest.getRaw()
        if (!json.authenticated || !json.user) {
          return null
        }
        return json.user
      } catch {
        return null
      }
    },
    retry: false,
  })

  return {
    user: query.data ?? null,
    loading: query.isLoading,
  }
}
