'use client'

import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { buildTtkScopeParams, toPayrollScopeUser } from '@/lib/ttk/map-header-filters'
import { useFilters } from '@/lib/filter-context'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import {
  EMPTY_TTK_TODAY_STATUS,
  type TtkTodayStatusData,
  type TtkTodayStatusResponse,
} from '@/lib/ttk/ttk-today-status-types'
import { SrsPhpPath } from '@/types/enum-url'

export function ttkTodayStatusQueryKey(selectedDealers: string[]) {
  return ['ttk-today-status', selectedDealers.slice().sort().join(',')] as const
}

export function useTtkTodayStatus({ enabled = true }: { enabled?: boolean } = {}) {
  const { selectedDealers } = useFilters()
  const { user } = useSrsMe()
  const scopeUser = toPayrollScopeUser(user)
  const debouncedDealers = useDebouncedValue(selectedDealers, 450)

  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    TtkTodayStatusResponse
  >(SrsPhpPath.TTK_TODAY_STATUS)

  const params = buildTtkScopeParams({
    search: '',
    selectedDealers: debouncedDealers,
    dateRange: undefined,
    scopeUser,
  })

  const queryEnabled = enabled && debouncedDealers.length > 0

  const query = useQuery({
    queryKey: ttkTodayStatusQueryKey(debouncedDealers),
    enabled: queryEnabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const json = await apiRequest.getCustom('', undefined, params)
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
