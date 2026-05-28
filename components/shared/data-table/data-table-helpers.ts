/**
 * Shared types + helpers for the server-side wiring of the DataTable
 * component. These let the consumer translate the table's internal state
 * (`sorting`, `columnFilters`) into the exact query-string the backend
 * expects, using each column's `meta.filter` / `meta.sortKey` configuration.
 */

import type { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table'

/* -------------------------------------------------------------------------- */
/* Operator catalogues                                                         */
/* -------------------------------------------------------------------------- */

export type TextFilterOperator =
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'equals'
  | 'not_equals'

export type NumberFilterOperator =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'

export type DateFilterOperator =
  | 'eq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'

/* -------------------------------------------------------------------------- */
/* Filter value (lives inside TanStack's columnFilters state)                  */
/* -------------------------------------------------------------------------- */

export interface TextFilterValue {
  type: 'text'
  operator: TextFilterOperator
  value: string
}

export interface NumberFilterValue {
  type: 'number'
  operator: NumberFilterOperator
  value: number | null
}

export interface DateFilterValue {
  type: 'date'
  operator: DateFilterOperator
  /** ISO date string `YYYY-MM-DD`. */
  value: string
}

export type ColumnFilterValue =
  | TextFilterValue
  | NumberFilterValue
  | DateFilterValue

/* -------------------------------------------------------------------------- */
/* Filter configuration (declared in column meta)                              */
/* -------------------------------------------------------------------------- */

interface BaseFilterConfig {
  /** Query-string key the backend expects (e.g. `name`, `salary`, `hire_date`). */
  backendKey: string
  /** Suffix appended to `backendKey` for the operator. Defaults to `_op`. */
  operatorParamSuffix?: string
  /** Placeholder for the input. */
  placeholder?: string
}

export interface TextFilterConfig extends BaseFilterConfig {
  type: 'text'
  defaultOperator?: TextFilterOperator
}

export interface NumberFilterConfig extends BaseFilterConfig {
  type: 'number'
  defaultOperator?: NumberFilterOperator
}

export interface DateFilterConfig extends BaseFilterConfig {
  type: 'date'
  defaultOperator?: DateFilterOperator
}

export type ColumnFilterConfig =
  | TextFilterConfig
  | NumberFilterConfig
  | DateFilterConfig

/* -------------------------------------------------------------------------- */
/* Operator labels (for the UI)                                                */
/* -------------------------------------------------------------------------- */

export const TEXT_OPERATOR_LABELS: Record<TextFilterOperator, string> = {
  contains: 'Contains',
  not_contains: 'Does not contain',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  equals: 'Equals',
  not_equals: 'Not equals',
}

export const NUMBER_OPERATOR_LABELS: Record<NumberFilterOperator, string> = {
  eq: '= equals',
  neq: '≠ not equals',
  lt: '< less than',
  lte: '≤ less or equal',
  gt: '> greater than',
  gte: '≥ greater or equal',
}

export const DATE_OPERATOR_LABELS: Record<DateFilterOperator, string> = {
  eq: '= on date',
  lt: '< before',
  lte: '≤ on or before',
  gt: '> after',
  gte: '≥ on or after',
}

export const DEFAULT_OPERATOR_BY_TYPE: {
  text: TextFilterOperator
  number: NumberFilterOperator
  date: DateFilterOperator
} = {
  text: 'contains',
  number: 'eq',
  date: 'eq',
}

/* -------------------------------------------------------------------------- */
/* Pin / sort helpers (column meta-aware)                                      */
/* -------------------------------------------------------------------------- */

/** Resolve a stable id for a column def. */
function getColumnId<TData>(col: ColumnDef<TData>): string | undefined {
  // ColumnDef.id wins. Otherwise `accessorKey` (only present on accessor cols).
  const explicit = (col as { id?: string }).id
  if (explicit) return explicit
  const key = (col as { accessorKey?: string }).accessorKey
  return key
}

/** Read `meta` from a column def with the right type. */
function getMeta<TData>(col: ColumnDef<TData>): {
  filter?: ColumnFilterConfig
  sortKey?: string
} | undefined {
  return col.meta as
    | { filter?: ColumnFilterConfig; sortKey?: string }
    | undefined
}

/* -------------------------------------------------------------------------- */
/* Backend payload builders                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build a flat record of query params from the current `columnFilters` state
 * plus each column's `meta.filter` config.
 *
 * Convention (per column):
 *   `<backendKey>`        = filter value
 *   `<backendKey>_op`     = operator (suffix configurable via `operatorParamSuffix`)
 *
 * Empty / null values are skipped.
 */
export function buildBackendFilters<TData>(
  columns: ColumnDef<TData>[],
  state: ColumnFiltersState,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (state.length === 0) return out

  // Map column id → filter config for O(1) lookup.
  const configById = new Map<string, ColumnFilterConfig>()
  for (const col of columns) {
    const id = getColumnId(col)
    const meta = getMeta(col)
    if (!id || !meta?.filter) continue
    configById.set(id, meta.filter)
  }

  for (const f of state) {
    const cfg = configById.get(f.id)
    if (!cfg) continue
    const v = f.value as ColumnFilterValue | undefined
    if (!v) continue

    const valueStr =
      v.type === 'number'
        ? v.value == null || Number.isNaN(v.value)
          ? ''
          : String(v.value)
        : String(v.value ?? '')

    if (valueStr === '') continue

    const opSuffix = cfg.operatorParamSuffix ?? '_op'
    out[cfg.backendKey] = valueStr
    out[`${cfg.backendKey}${opSuffix}`] = v.operator
  }

  return out
}

/**
 * Build `{ sort, dir }` payload from the current sorting state. Uses
 * `meta.sortKey` when present, otherwise falls back to the column id.
 * Returns `null` when there is no active sort.
 */
export function buildBackendSort<TData>(
  columns: ColumnDef<TData>[],
  sorting: SortingState,
): { sort: string; dir: 'asc' | 'desc' } | null {
  if (sorting.length === 0) return null
  const first = sorting[0]!
  let key = first.id
  for (const col of columns) {
    const id = getColumnId(col)
    if (id !== first.id) continue
    const meta = getMeta(col)
    if (meta?.sortKey) key = meta.sortKey
    break
  }
  return { sort: key, dir: first.desc ? 'desc' : 'asc' }
}

/**
 * Convenience — merge filters + sort + extra params into a single object
 * ready to feed into a fetch helper / `URLSearchParams`.
 */
export function buildBackendQuery<TData>(args: {
  columns: ColumnDef<TData>[]
  sorting: SortingState
  columnFilters: ColumnFiltersState
  page: number
  pageSize: number
  pageParam?: string
  pageSizeParam?: string
  sortParam?: string
  dirParam?: string
  extra?: Record<string, string | number | undefined>
}): Record<string, string> {
  const {
    columns,
    sorting,
    columnFilters,
    page,
    pageSize,
    pageParam = 'page',
    pageSizeParam = 'page_size',
    sortParam = 'sort',
    dirParam = 'dir',
    extra,
  } = args

  const out: Record<string, string> = {
    [pageParam]: String(page),
    [pageSizeParam]: String(pageSize),
  }

  const sortPayload = buildBackendSort(columns, sorting)
  if (sortPayload) {
    out[sortParam] = sortPayload.sort
    out[dirParam] = sortPayload.dir
  }

  Object.assign(out, buildBackendFilters(columns, columnFilters))

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '') out[k] = String(v)
    }
  }

  return out
}
