'use client'

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type Row,
  type SortingState,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table'
import { Loader2, Database } from 'lucide-react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { DataTableToolbar } from './data-table-toolbar'
import { DataTablePagination } from './data-table-pagination'

/* -------------------------------------------------------------------------- */
/* Paginated server-side contract                                              */
/* -------------------------------------------------------------------------- */

/**
 * Standard paginated response shape expected from the backend.
 * - `page` is 1-based.
 * - `hasMore` is the source of truth; derive it server-side when `total` is
 *   not available.
 */
export interface PaginatedDataTableResponse<T> {
  results: T[]
  page: number
  pageSize: number
  total?: number
  hasMore: boolean
}

/** Column meta hook for the table machinery. */
export interface DataTableColumnMeta<TData> {
  /** Human-readable label (overrides string header for view options / export). */
  label?: string
  /** Custom value getter used when exporting (defaults to the accessor). */
  exportValue?: (row: TData) => unknown
  /** Tailwind class applied to the header cell. */
  headerClassName?: string
  /** Tailwind class applied to every body cell of this column. */
  cellClassName?: string
  /** Convenience flag — applies `font-mono` to the body cell. */
  mono?: boolean
  /** Convenience flag — applies `text-right` to header + body cell. */
  numeric?: boolean
}

/** Visual treatment for the header row. */
export type DataTableHeaderVariant = 'colored' | 'subtle'

/* -------------------------------------------------------------------------- */
/* Persistence helpers                                                         */
/* -------------------------------------------------------------------------- */

const STORAGE_PREFIX = 'datatable.v1.'

function readPersistedVisibility(tableId: string | undefined): VisibilityState {
  if (!tableId || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tableId}.cols`)
    return raw ? (JSON.parse(raw) as VisibilityState) : {}
  } catch {
    return {}
  }
}

function persistVisibility(tableId: string | undefined, value: VisibilityState) {
  if (!tableId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${tableId}.cols`, JSON.stringify(value))
  } catch {
    /* ignore quota errors */
  }
}

function readPersistedPageSize(tableId: string | undefined, fallback: number): number {
  if (!tableId || typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tableId}.pageSize`)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : fallback
  } catch {
    return fallback
  }
}

function persistPageSize(tableId: string | undefined, size: number) {
  if (!tableId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${tableId}.pageSize`, String(size))
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export interface DataTableProps<TData, TValue = unknown> {
  tableId: string
  columns: ColumnDef<TData, TValue>[]
  data: TData[]

  isLoading?: boolean
  emptyState?: React.ReactNode

  // ---------- Pagination ----------
  pagination?: {
    pageIndex: number
    pageSize: number
    pageCount: number
    totalRows?: number
    onPaginationChange: (state: PaginationState) => void
  }
  defaultPageSize?: number
  pageSizeOptions?: number[]

  // ---------- Sorting ----------
  sorting?: SortingState
  onSortingChange?: (s: SortingState) => void
  manualSorting?: boolean

  // ---------- Filtering ----------
  enableGlobalFilter?: boolean
  globalFilter?: string
  onGlobalFilterChange?: (v: string) => void
  manualFiltering?: boolean
  globalFilterPlaceholder?: string

  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: (s: ColumnFiltersState) => void

  // ---------- Selection ----------
  enableRowSelection?: boolean
  rowSelection?: Record<string, boolean>
  onRowSelectionChange?: (s: Record<string, boolean>) => void
  getRowId?: (row: TData, index: number) => string

  // ---------- Interactivity ----------
  onRowClick?: (row: TData) => void

  // ---------- Toolbar ----------
  enableViewOptions?: boolean
  enableExport?: boolean
  exportFileName?: string
  fetchAllRowsForExport?: () => Promise<TData[]>
  toolbarLeading?: React.ReactNode
  toolbarTrailing?: React.ReactNode

  // ---------- Style ----------
  className?: string
  /** `compact` (default) = `py-1.5 text-xs` rows. `comfortable` = roomier. */
  density?: 'comfortable' | 'compact'
  /** `colored` (default) = solid blue header w/ white text. `subtle` = muted bg w/ foreground text. */
  headerVariant?: DataTableHeaderVariant
  /** Custom hex color when `headerVariant === 'colored'`. Defaults to `#1565C0`. */
  headerColor?: string
  /** Sticky header inside the scroll container. Defaults to true. */
  stickyHeader?: boolean
  /** Zebra striping on alternate rows. Defaults to true. */
  zebraRows?: boolean
}

export function DataTable<TData, TValue = unknown>({
  tableId,
  columns,
  data,
  isLoading = false,
  emptyState,
  pagination,
  defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  sorting,
  onSortingChange,
  manualSorting,
  enableGlobalFilter = true,
  globalFilter,
  onGlobalFilterChange,
  manualFiltering,
  globalFilterPlaceholder = 'Search…',
  columnFilters,
  onColumnFiltersChange,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  onRowClick,
  enableViewOptions = true,
  enableExport = true,
  exportFileName,
  fetchAllRowsForExport,
  toolbarLeading,
  toolbarTrailing,
  className,
  density = 'compact',
  headerVariant = 'colored',
  headerColor = '#1565C0',
  stickyHeader = true,
  zebraRows = true,
}: DataTableProps<TData, TValue>) {
  /* ---------- Persisted visibility ---------- */
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    readPersistedVisibility(tableId),
  )
  React.useEffect(() => {
    persistVisibility(tableId, columnVisibility)
  }, [tableId, columnVisibility])

  /* ---------- Local fallbacks for uncontrolled props ---------- */
  const [localSorting, setLocalSorting] = React.useState<SortingState>([])
  const [localGlobalFilter, setLocalGlobalFilter] = React.useState('')
  const [localColumnFilters, setLocalColumnFilters] = React.useState<ColumnFiltersState>([])
  const [localSelection, setLocalSelection] = React.useState<Record<string, boolean>>({})

  /* ---------- Pagination state ---------- */
  const isServerPagination = !!pagination
  const [localPagination, setLocalPagination] = React.useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize: readPersistedPageSize(tableId, defaultPageSize),
  }))

  const paginationState: PaginationState = isServerPagination
    ? { pageIndex: pagination!.pageIndex, pageSize: pagination!.pageSize }
    : localPagination

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const next =
      typeof updater === 'function'
        ? (updater as (s: PaginationState) => PaginationState)(paginationState)
        : updater
    persistPageSize(tableId, next.pageSize)
    if (isServerPagination) {
      pagination!.onPaginationChange(next)
    } else {
      setLocalPagination(next)
    }
  }

  const table = useReactTable<TData>({
    data,
    columns,
    state: {
      sorting: sorting ?? localSorting,
      columnVisibility,
      columnFilters: columnFilters ?? localColumnFilters,
      globalFilter: globalFilter ?? localGlobalFilter,
      rowSelection: rowSelection ?? localSelection,
      pagination: paginationState,
    },
    enableRowSelection,
    getRowId,

    manualSorting: manualSorting ?? false,
    onSortingChange: (updater) => {
      const value =
        typeof updater === 'function'
          ? (updater as (s: SortingState) => SortingState)(sorting ?? localSorting)
          : updater
      if (onSortingChange) onSortingChange(value)
      else setLocalSorting(value)
    },

    manualFiltering: manualFiltering ?? false,
    onGlobalFilterChange: (updater) => {
      const value =
        typeof updater === 'function'
          ? (updater as (s: string) => string)(globalFilter ?? localGlobalFilter)
          : (updater as string)
      if (onGlobalFilterChange) onGlobalFilterChange(value)
      else setLocalGlobalFilter(value)
    },
    onColumnFiltersChange: (updater) => {
      const value =
        typeof updater === 'function'
          ? (updater as (s: ColumnFiltersState) => ColumnFiltersState)(
              columnFilters ?? localColumnFilters,
            )
          : updater
      if (onColumnFiltersChange) onColumnFiltersChange(value)
      else setLocalColumnFilters(value)
    },

    onRowSelectionChange: (updater) => {
      const current = rowSelection ?? localSelection
      const value =
        typeof updater === 'function'
          ? (updater as (s: Record<string, boolean>) => Record<string, boolean>)(current)
          : updater
      if (onRowSelectionChange) onRowSelectionChange(value)
      else setLocalSelection(value)
    },

    onColumnVisibilityChange: setColumnVisibility,

    manualPagination: isServerPagination,
    pageCount: isServerPagination ? pagination!.pageCount : undefined,
    onPaginationChange: handlePaginationChange,

    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
    getPaginationRowModel: isServerPagination ? undefined : getPaginationRowModel(),
  })

  const visibleColCount = table.getVisibleLeafColumns().length
  const rowPadding = density === 'compact' ? 'py-1.5' : 'py-2.5'

  const headerIsColored = headerVariant === 'colored'
  const headerStyle = headerIsColored ? { backgroundColor: headerColor } : undefined
  const headerClassName = headerIsColored
    ? 'text-white hover:[&_tr]:bg-transparent'
    : 'bg-muted/40 text-foreground'

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden border-border py-0 shadow-sm',
        className,
      )}
    >
      <DataTableToolbar
        table={table}
        totalRows={pagination?.totalRows}
        isLoading={isLoading}
        enableGlobalFilter={enableGlobalFilter}
        globalFilterPlaceholder={globalFilterPlaceholder}
        enableViewOptions={enableViewOptions}
        enableExport={enableExport}
        exportFileName={exportFileName}
        fetchAllRowsForExport={fetchAllRowsForExport}
        pageSizeOptions={pageSizeOptions}
        leading={toolbarLeading}
        trailing={toolbarTrailing}
      />

      <div className="relative w-full overflow-x-auto">
        <Table>
          <TableHeader
            className={cn(
              '[&_tr]:border-0',
              stickyHeader && 'sticky top-0 z-10',
              headerClassName,
            )}
          >
            {table.getHeaderGroups().map((group) => (
              <TableRow
                key={group.id}
                className={cn(
                  'border-0',
                  headerIsColored && 'hover:bg-transparent',
                )}
                style={headerStyle}
              >
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | DataTableColumnMeta<TData>
                    | undefined
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        width: header.getSize() !== 150 ? header.getSize() : undefined,
                      }}
                      className={cn(
                        'h-8 px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
                        headerIsColored ? 'text-white' : 'text-foreground',
                        meta?.numeric && 'text-right',
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading && data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColCount}
                  className="h-32 text-center align-middle text-muted-foreground"
                >
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColCount}
                  className="h-32 text-center align-middle"
                >
                  {emptyState ?? (
                    <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                      <Database className="size-7 opacity-30" />
                      <p className="text-xs font-medium text-foreground">No rows</p>
                      <p className="text-[11px]">Nothing to show with the current filters.</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row: Row<TData>, index) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-b border-border/50 transition-colors',
                    zebraRows && index % 2 !== 0 && 'bg-muted/25',
                    onRowClick && 'cursor-pointer hover:bg-accent/40',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | DataTableColumnMeta<TData>
                      | undefined
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'px-3 text-xs',
                          rowPadding,
                          meta?.mono && 'font-mono',
                          meta?.numeric && 'text-right tabular-nums',
                          meta?.cellClassName,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {isLoading && data.length > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/30 pt-3 backdrop-blur-[1px]">
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
              <Loader2 className="size-3 animate-spin" />
              Refreshing…
            </div>
          </div>
        )}
      </div>

      <DataTablePagination table={table} totalRows={pagination?.totalRows} />
    </Card>
  )
}
