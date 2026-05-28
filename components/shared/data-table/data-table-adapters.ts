/**
 * Pluggable request/response adapters so DataTable pages can talk to different
 * backend contracts (paginated `page`/`page_size` vs legacy DataTables, etc.).
 */

import type { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table'
import { buildBackendQuery } from './data-table-helpers'
import type { PaginatedDataTableResponse } from './data-table'

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface DataTableQueryContext<TData> {
  pageIndex: number
  pageSize: number
  sorting: SortingState
  columnFilters: ColumnFiltersState
  columns: ColumnDef<TData>[]
  /** Global search term (toolbar). */
  globalFilter?: string
  /** Endpoint-specific params (dealers, date range, flags, …). */
  extra?: Record<string, string | number | undefined>
}

export interface DataTableQueryResult<TData> {
  rows: TData[]
  total: number
  pageCount: number
  hasMore?: boolean
}

export interface DataTableServerAdapter<TData, TRaw = unknown> {
  buildRequest: (ctx: DataTableQueryContext<TData>) => Record<string, string | number>
  parseResponse: (
    raw: TRaw,
    ctx: Pick<DataTableQueryContext<TData>, 'pageIndex' | 'pageSize'>,
  ) => DataTableQueryResult<TData>
}

/** jQuery DataTables / legacy SRS list shape (`ttk-list.php`, etc.). */
export type DataTablesLegacyResponse<TData> = {
  draw?: string | number
  recordsTotal?: string | number
  recordsFiltered?: string | number
  data?: TData[]
}

/* -------------------------------------------------------------------------- */
/* Modern paginated adapter (`PaginatedDataTableResponse`)                       */
/* -------------------------------------------------------------------------- */

export type PaginatedApiEnvelope<TData> = {
  data?: PaginatedDataTableResponse<TData>
  status?: string
}

export function createPaginatedAdapter<TData>(options?: {
  /** Unwrap `{ data: { results, total, … } }` or a bare paginated payload. */
  unwrap?: (raw: unknown) => PaginatedDataTableResponse<TData>
  pageParam?: string
  pageSizeParam?: string
  sortParam?: string
  dirParam?: string
}): DataTableServerAdapter<TData, unknown> {
  const unwrap =
    options?.unwrap ??
    ((raw: unknown) => {
      const envelope = raw as PaginatedApiEnvelope<TData>
      if (envelope?.data?.results) return envelope.data
      return raw as PaginatedDataTableResponse<TData>
    })

  return {
    buildRequest: (ctx) =>
      buildBackendQuery({
        columns: ctx.columns,
        sorting: ctx.sorting,
        columnFilters: ctx.columnFilters,
        page: ctx.pageIndex + 1,
        pageSize: ctx.pageSize,
        pageParam: options?.pageParam,
        pageSizeParam: options?.pageSizeParam,
        sortParam: options?.sortParam,
        dirParam: options?.dirParam,
        extra: {
          ...(ctx.globalFilter?.trim() ? { term: ctx.globalFilter.trim() } : {}),
          ...ctx.extra,
        },
      }),

    parseResponse: (raw, { pageSize }) => {
      const payload = unwrap(raw)
      const total = payload.total ?? payload.results.length
      const pageCount = Math.max(1, Math.ceil(total / pageSize))
      return {
        rows: payload.results,
        total,
        pageCount,
        hasMore: payload.hasMore,
      }
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Legacy DataTables adapter (`start` / `length` / `recordsFiltered`)            */
/* -------------------------------------------------------------------------- */

export type DataTablesLegacyAdapterOptions<TData> = {
  /**
   * Maps TanStack sorting → backend sort string (e.g. `tew.punch_in DESC`).
   * When omitted, no `order_by` param is sent.
   */
  mapSort?: (sorting: SortingState, columns: ColumnDef<TData>[]) => string | undefined
  /** Query key for global search. Default `search[value]`. */
  searchParam?: string
  /** Incrementing draw counter; default uses `pageIndex + 1`. */
  getDraw?: (pageIndex: number) => number
}

export function createDataTablesLegacyAdapter<TData>(
  options: DataTablesLegacyAdapterOptions<TData> = {},
): DataTableServerAdapter<TData, DataTablesLegacyResponse<TData>> {
  const searchParam = options.searchParam ?? 'search[value]'
  const getDraw = options.getDraw ?? ((pageIndex: number) => pageIndex + 1)

  return {
    buildRequest: (ctx) => {
      const params: Record<string, string | number> = {
        draw: getDraw(ctx.pageIndex),
        start: ctx.pageIndex * ctx.pageSize,
        length: ctx.pageSize,
      }

      const term = ctx.globalFilter?.trim()
      if (term) params[searchParam] = term

      const orderBy = options.mapSort?.(ctx.sorting, ctx.columns)
      if (orderBy) params.order_by = orderBy

      if (ctx.extra) {
        for (const [k, v] of Object.entries(ctx.extra)) {
          if (v !== undefined && v !== '') params[k] = v
        }
      }

      return params
    },

    parseResponse: (raw, { pageSize }) => {
      const total = Number(raw.recordsFiltered ?? raw.recordsTotal ?? 0)
      return {
        rows: raw.data ?? [],
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      }
    },
  }
}

/** Preset used by payroll TTK list endpoints. */
export function createTtkListAdapter<TData>(
  mapSort: (sorting: SortingState) => string,
): DataTableServerAdapter<TData, DataTablesLegacyResponse<TData>> {
  return createDataTablesLegacyAdapter<TData>({
    mapSort: (sorting) => mapSort(sorting),
  })
}
