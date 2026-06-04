'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import {
  EMPTY_TTK_TODAY_STATUS,
  type TtkTodayStatusData,
  type TtkTodayStatusResponse,
} from '@/lib/ttk/ttk-today-status-types'
import { SrsPhpPath } from '@/types/enum-url'

export function ttkTodayStatusQueryKey() {
  return ['ttk-today-status'] as const
}

export function useTtkTodayStatus({ enabled = true }: { enabled?: boolean } = {}) {
  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    TtkTodayStatusResponse
  >(SrsPhpPath.TTK_TODAY_STATUS)

  const query = useQuery({
    queryKey: ttkTodayStatusQueryKey(),
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const json = await apiRequest.getCustom('', undefined, {})
      const payload = assertSrsSuccess<TtkTodayStatusResponse['data']>(
        json,
        'Failed to load today status',
      )
      return payload?.status ?? EMPTY_TTK_TODAY_STATUS
    },
  })

  return {
    status: (query.data ?? EMPTY_TTK_TODAY_STATUS) as TtkTodayStatusData,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
