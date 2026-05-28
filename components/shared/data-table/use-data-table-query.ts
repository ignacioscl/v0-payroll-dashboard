'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table'
import type {
  DataTableQueryResult,
  DataTableServerAdapter,
} from './data-table-adapters'

export type UseDataTableQueryArgs<TData, TRaw> = {
  adapter: DataTableServerAdapter<TData, TRaw>
  queryKey: readonly unknown[]
  /** Fetch raw API payload from built query params. */
  queryFn: (params: Record<string, string | number>) => Promise<TRaw>
  enabled?: boolean
  staleTime?: number
  pageIndex: number
  pageSize: number
  sorting: SortingState
  columnFilters: ColumnFiltersState
  columns: ColumnDef<TData>[]
  globalFilter?: string
  extra?: Record<string, string | number | undefined>
}

export type UseDataTableQueryResult<TData> = {
  rows: TData[]
  total: number
  pageCount: number
  hasMore?: boolean
  isLoading: boolean
  isFetching: boolean
  error: string | null
  refetch: () => void
}

/**
 * Wires TanStack Query to a {@link DataTableServerAdapter} so pages only pass
 * `data` + `pagination` into `<DataTable />`.
 */
export function useDataTableQuery<TData, TRaw>(
  args: UseDataTableQueryArgs<TData, TRaw>,
): UseDataTableQueryResult<TData> {
  const {
    adapter,
    queryKey,
    queryFn,
    enabled = true,
    staleTime = 10_000,
    pageIndex,
    pageSize,
    sorting,
    columnFilters,
    columns,
    globalFilter,
    extra,
  } = args

  const query = useQuery({
    queryKey: [...queryKey, pageIndex, pageSize, sorting, columnFilters, globalFilter, extra],
    enabled,
    staleTime,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = adapter.buildRequest({
        pageIndex,
        pageSize,
        sorting,
        columnFilters,
        columns,
        globalFilter,
        extra,
      })
      const raw = await queryFn(params)
      return adapter.parseResponse(raw, { pageIndex, pageSize })
    },
  })

  const data = query.data as DataTableQueryResult<TData> | undefined

  return {
    rows: data?.rows ?? [],
    total: data?.total ?? 0,
    pageCount: data?.pageCount ?? 1,
    hasMore: data?.hasMore,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => {
      void query.refetch()
    },
  }
}
