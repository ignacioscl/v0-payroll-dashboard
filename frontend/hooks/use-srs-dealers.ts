'use client'

import { useQuery } from '@tanstack/react-query'
import type { DealerOption } from '@/components/filters/types'
import { useApiRequest } from '@/lib/hooks/use-api-request'
import { UrlEnum } from '@/types/enum-url'

type DealersResponse = {
  dealers?: DealerOption[]
  error?: string
}

export const dealersQueryKey = ['dealers'] as const

type UseSrsDealersResult = {
  dealers: DealerOption[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useSrsDealers(): UseSrsDealersResult {
  const apiRequest = useApiRequest<DealerOption[], undefined, DealersResponse>(
    UrlEnum.DEALERS,
  )

  const query = useQuery({
    queryKey: dealersQueryKey,
    queryFn: async () => {
      const json = await apiRequest.getRaw()
      if (json.error) {
        throw new Error(json.error)
      }
      return json.dealers ?? []
    },
  })

  return {
    dealers: query.data ?? [],
    loading: query.isLoading,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? String(query.error)
          : null,
    reload: () => {
      void query.refetch()
    },
  }
}
