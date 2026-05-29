'use client'

import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { buildTtkScopeParams } from '@/lib/ttk/map-header-filters'
import {
  EMPTY_TTK_DASHBOARD_SUMMARY,
  type TtkDashboardSummaryData,
  type TtkDashboardSummaryResponse,
} from '@/lib/ttk/ttk-dashboard-summary-types'
import { SrsPhpPath } from '@/types/enum-url'
import type { DateRange } from 'react-day-picker'

export type UseTtkDashboardSummaryArgs = {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  filtersHydrated?: boolean
  enabled?: boolean
}

export function ttkDashboardSummaryQueryKey(args: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
}) {
  return [
    'ttk-dashboard-summary',
    args.search,
    args.selectedDealers.slice().sort().join(','),
    args.dateRange?.from?.toISOString(),
    args.dateRange?.to?.toISOString(),
  ] as const
}

export function useTtkDashboardSummary(args: UseTtkDashboardSummaryArgs) {
  const debouncedDealers = useDebouncedValue(args.selectedDealers, 450)
  const debouncedSearch = useDebouncedValue(args.search, 300)

  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    TtkDashboardSummaryResponse
  >(SrsPhpPath.TTK_DASHBOARD_SUMMARY)

  const queryArgs = {
    search: debouncedSearch,
    selectedDealers: debouncedDealers,
    dateRange: args.dateRange,
  }

  const params = buildTtkScopeParams(queryArgs)
  const enabled =
    (args.filtersHydrated ?? true) &&
    (args.enabled ?? true) &&
    debouncedDealers.length > 0 &&
    Boolean(params.fecha_desde) &&
    Boolean(params.fecha_hasta)

  const query = useQuery({
    queryKey: ttkDashboardSummaryQueryKey(queryArgs),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const json = await apiRequest.getCustom('', undefined, params)
      const payload = assertSrsSuccess<TtkDashboardSummaryResponse['data']>(
        json,
        'Failed to load dashboard summary',
      )
      return payload?.summary ?? EMPTY_TTK_DASHBOARD_SUMMARY
    },
  })

  return {
    summary: (query.data ?? EMPTY_TTK_DASHBOARD_SUMMARY) as TtkDashboardSummaryData,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
