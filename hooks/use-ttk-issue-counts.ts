'use client'

import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useApiRequest } from '@/lib/hooks/use-api-request'
import { buildTtkScopeParams } from '@/lib/ttk/map-header-filters'
import {
  EMPTY_TTK_ISSUE_COUNTS,
  type TtkIssueCountsData,
  type TtkIssueCountsResponse,
} from '@/lib/ttk/ttk-issue-counts-types'
import { SrsProxyPath } from '@/types/enum-url'
import type { DateRange } from 'react-day-picker'

export type UseTtkIssueCountsArgs = {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  filtersHydrated?: boolean
  enabled?: boolean
}

export function ttkIssueCountsQueryKey(args: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
}) {
  return [
    'ttk-issue-counts',
    args.search,
    args.selectedDealers.slice().sort().join(','),
    args.dateRange?.from?.toISOString(),
    args.dateRange?.to?.toISOString(),
  ] as const
}

export function useTtkIssueCounts(args: UseTtkIssueCountsArgs) {
  const debouncedDealers = useDebouncedValue(args.selectedDealers, 450)
  const debouncedSearch = useDebouncedValue(args.search, 300)

  const apiRequest = useApiRequest<unknown, Record<string, string | number>, TtkIssueCountsResponse>(
    SrsProxyPath.TTK_ISSUE_COUNTS,
  )

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
    queryKey: ttkIssueCountsQueryKey(queryArgs),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const json = await apiRequest.getCustom('', undefined, params)
      if (json.status === 'fail' || json.error?.message) {
        throw new Error(json.error?.message ?? 'Failed to load issue counts')
      }
      const payload = json as TtkIssueCountsResponse
      return payload.data?.counts ?? payload.counts ?? EMPTY_TTK_ISSUE_COUNTS
    },
  })

  return {
    counts: (query.data ?? EMPTY_TTK_ISSUE_COUNTS) as TtkIssueCountsData,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
