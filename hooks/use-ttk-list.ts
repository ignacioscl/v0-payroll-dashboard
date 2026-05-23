'use client'

import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useApiRequest } from '@/lib/hooks/use-api-request'
import { buildTtkListParams } from '@/lib/ttk/map-header-filters'
import type { TtkListResponse } from '@/lib/ttk/ttk-list-types'
import { SrsProxyPath } from '@/types/enum-url'
import type { DateRange } from 'react-day-picker'

export type UseTtkListArgs = {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  selectedType: string
  pageIndex: number
  pageSize: number
  orderBy: string
  enabled?: boolean
  filtersHydrated?: boolean
}

export function ttkListQueryKey(args: UseTtkListArgs & { selectedDealers: string[] }) {
  return [
    'ttk-list',
    args.search,
    args.selectedDealers.slice().sort().join(','),
    args.dateRange?.from?.toISOString(),
    args.dateRange?.to?.toISOString(),
    args.selectedType,
    args.pageIndex,
    args.pageSize,
    args.orderBy,
  ] as const
}

export function useTtkList(args: UseTtkListArgs) {
  const debouncedDealers = useDebouncedValue(args.selectedDealers, 450)
  const debouncedSearch = useDebouncedValue(args.search, 300)

  const apiRequest = useApiRequest<unknown, Record<string, string | number>, TtkListResponse>(
    SrsProxyPath.TTK_LIST,
  )

  const queryArgs = {
    ...args,
    search: debouncedSearch,
    selectedDealers: debouncedDealers,
  }

  const params = buildTtkListParams(queryArgs)
  const enabled =
    (args.filtersHydrated ?? true) &&
    (args.enabled ?? true) &&
    debouncedDealers.length > 0 &&
    Boolean(params.fecha_desde) &&
    Boolean(params.fecha_hasta)

  const query = useQuery({
    queryKey: ttkListQueryKey(queryArgs),
    enabled,
    gcTime: 2 * 60 * 1000,
    queryFn: async () => {
      const json = await apiRequest.getCustom('', undefined, params)
      if (json.status === 'fail' || json.error) {
        throw new Error(json.error?.message ?? 'Failed to load TTK list')
      }
      return json
    },
  })

  const total = Number(query.data?.recordsFiltered ?? query.data?.recordsTotal ?? 0)
  const dealersPending =
    args.selectedDealers.slice().sort().join(',') !== debouncedDealers.slice().sort().join(',')

  return {
    rows: query.data?.data ?? [],
    total,
    loading: query.isLoading || query.isFetching || dealersPending,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  }
}
