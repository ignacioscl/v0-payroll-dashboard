'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiRequest } from '@/lib/hooks/use-api-request'
import { UrlEnum } from '@/types/enum-url'
import type { SrsMeApiResponse, SrsMeUser, SrsPermission } from './types'

export const meQueryKey = ['auth', 'me'] as const

export function useSrsMe() {
  const apiRequest = useApiRequest<SrsMeUser, undefined, SrsMeApiResponse>(
    UrlEnum.AUTH_ME,
  )

  const query = useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      const json = await apiRequest.getRaw()
      if (!json.authenticated || !json.user) {
        return null
      }
      return {
        user: json.user,
        permissionIds: json.permissionIds ?? [],
        permissions: json.permissions ?? [],
      }
    },
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const hasPermission = useCallback(
    (permissionId: number) => {
      if (!query.data) return false
      return query.data.permissionIds.includes(permissionId)
    },
    [query.data],
  )

  return {
    user: query.data?.user ?? null,
    permissionIds: query.data?.permissionIds ?? [],
    permissions: (query.data?.permissions ?? []) as SrsPermission[],
    loading: query.isLoading,
    hasPermission,
    reload: () => {
      void query.refetch()
    },
  }
}
