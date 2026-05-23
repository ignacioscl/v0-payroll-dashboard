'use client'

import { useQuery } from '@tanstack/react-query'
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
}

export function ttkListQueryKey(args: UseTtkListArgs) {
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
  const apiRequest = useApiRequest<unknown, Record<string, string | number>, TtkListResponse>(
    SrsProxyPath.TTK_LIST,
  )

  const params = buildTtkListParams(args)
  const enabled =
    (args.enabled ?? true) &&
    args.selectedDealers.length > 0 &&
    Boolean(params.fecha_desde) &&
    Boolean(params.fecha_hasta)

  const query = useQuery({
    queryKey: ttkListQueryKey(args),
    enabled,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const json = await apiRequest.getCustom('', undefined, params)
      if (json.status === 'fail' || json.error) {
        throw new Error(json.error?.message ?? 'Failed to load TTK list')
      }
      return json
    },
  })

  const total = Number(query.data?.recordsFiltered ?? query.data?.recordsTotal ?? 0)

  return {
    rows: query.data?.data ?? [],
    total,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  }
}
