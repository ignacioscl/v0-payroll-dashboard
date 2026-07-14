'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'

import {
  createTtkListAdapter,
  type DataTableQueryResult,
  type DataTablesLegacyResponse,
} from '@/components/shared/data-table'
import { DATA_TABLE_PAGE_SIZE_ALL } from '@/components/shared/data-table/data-table-helpers'
import { throwIfSrsFail } from '@/lib/srs/parse-srs-response'
import type { TtkListResponse } from '@/lib/ttk/ttk-list-types'

type TtkListInfiniteArgs<TData> = {
  queryKey: readonly unknown[]
  enabled: boolean
  pageSize: number
  sorting: SortingState
  columns: ColumnDef<TData>[]
  extra: Record<string, string | number | undefined>
  mapSort: (sorting: SortingState) => string
  fetchPage: (params: Record<string, string | number>) => Promise<TtkListResponse>
  errorMessage: string
  staleTime?: number
}

/**
 * Legacy DataTables TTK list with infinite scroll (batch size 25) or single fetch (All = length -1).
 */
export function useTtkListInfinite<TData>({
  queryKey,
  enabled,
  pageSize,
  sorting,
  columns,
  extra,
  mapSort,
  fetchPage,
  errorMessage,
  staleTime = 2 * 60 * 1000,
}: TtkListInfiniteArgs<TData>) {
  const adapter = createTtkListAdapter<TData>(mapSort)
  const isAllMode = pageSize === DATA_TABLE_PAGE_SIZE_ALL
  const batchSize = isAllMode ? DATA_TABLE_PAGE_SIZE_ALL : pageSize

  return useInfiniteQuery<DataTableQueryResult<TData>>({
    queryKey: [...queryKey, batchSize, sorting, extra],
    enabled,
    staleTime,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const pageIndex = pageParam as number
      const params = adapter.buildRequest({
        pageIndex,
        pageSize: batchSize,
        sorting,
        columnFilters: [],
        columns,
        extra,
      })
      const raw = await fetchPage(params)
      throwIfSrsFail(raw, errorMessage)
      return adapter.parseResponse(raw as DataTablesLegacyResponse<TData>, {
        pageIndex,
        pageSize: batchSize,
      })
    },
    getNextPageParam: (lastPage, allPages) => {
      if (isAllMode) return undefined
      const loaded = allPages.reduce((sum, page) => sum + page.rows.length, 0)
      if (loaded >= lastPage.total || lastPage.rows.length < pageSize) return undefined
      return allPages.length
    },
  })
}
