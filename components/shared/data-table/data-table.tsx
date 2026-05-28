'use client'

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
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
import type { ColumnFilterConfig } from './data-table-helpers'

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
  /** Pin this column to the left/right edge. Reflected as a sticky CSS. */
  pin?: 'left' | 'right'
  /**
   * Column-level filter config. When set, a filter icon is rendered in the
   * header and the filter value is stored in TanStack's `columnFilters` state.
   * Use `buildBackendFilters(columns, columnFilters)` to translate state into
   * a query payload.
   */
  filter?: ColumnFilterConfig
  /**
   * Server-side sort key sent in the `sort` query param when this column is
   * the active sort. Defaults to the column id.
   */
  sortKey?: string
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

function readPersistedSizing(tableId: string | undefined): ColumnSizingState {
  if (!tableId || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tableId}.sizing`)
    return raw ? (JSON.parse(raw) as ColumnSizingState) : {}
  } catch {
    return {}
  }
}

function persistSizing(tableId: string | undefined, value: ColumnSizingState) {
  if (!tableId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${tableId}.sizing`,
      JSON.stringify(value),
    )
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* Pinning helpers                                                             */
/* -------------------------------------------------------------------------- */

function getColumnId<TData, TValue>(col: ColumnDef<TData, TValue>): string | undefined {
  const explicit = (col as { id?: string }).id
  if (explicit) return explicit
  return (col as { accessorKey?: string }).accessorKey
}

function buildInitialPinning<TData, TValue>(
  columns: ColumnDef<TData, TValue>[],
): ColumnPinningState {
  const left: string[] = []
  const right: string[] = []
  for (const col of columns) {
    const id = getColumnId(col)
    const meta = col.meta as DataTableColumnMeta<TData> | undefined
    if (!id) continue
    if (meta?.pin === 'left') left.push(id)
    else if (meta?.pin === 'right') right.push(id)
  }
  return { left, right }
}

/** Sticky CSS for a pinned column. Falls back to `{}` for unpinned ones. */
function getPinningStyles<TData>(column: Column<TData>): React.CSSProperties {
  const pin = column.getIsPinned()
  if (!pin) return {}
  if (pin === 'left') {
    return {
      position: 'sticky',
      left: `${column.getStart('left')}px`,
      zIndex: 1,
    }
  }
  return {
    position: 'sticky',
    right: `${column.getAfter('right')}px`,
    zIndex: 1,
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

  // ---------- Pinning ----------
  /** Override the initial pinning state derived from `meta.pin`. */
  columnPinning?: ColumnPinningState

  // ---------- Resizing ----------
  /**
   * Allow the user to drag the right edge of each column header to resize it.
   * Sizes are persisted per `tableId` in localStorage.
   * Defaults to `true`.
   */
  enableColumnResizing?: boolean

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
  density?: 'comfortable' | 'compact'
  headerVariant?: DataTableHeaderVariant
  headerColor?: string
  stickyHeader?: boolean
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
  columnPinning,
  enableColumnResizing = true,
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

  /* ---------- Pinning (initial from meta.pin) ---------- */
  const initialPinning = React.useMemo(
    () => columnPinning ?? buildInitialPinning(columns),
    [columnPinning, columns],
  )
  const [internalPinning, setInternalPinning] = React.useState<ColumnPinningState>(initialPinning)
  React.useEffect(() => {
    if (columnPinning) setInternalPinning(columnPinning)
  }, [columnPinning])

  /* ---------- Persisted column sizing ---------- */
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(() =>
    readPersistedSizing(tableId),
  )
  React.useEffect(() => {
    persistSizing(tableId, columnSizing)
  }, [tableId, columnSizing])

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
    defaultColumn: {
      size: 160,
      minSize: 60,
      maxSize: 800,
    },
    state: {
      sorting: sorting ?? localSorting,
      columnVisibility,
      columnFilters: columnFilters ?? localColumnFilters,
      globalFilter: globalFilter ?? localGlobalFilter,
      rowSelection: rowSelection ?? localSelection,
      pagination: paginationState,
      columnPinning: internalPinning,
      columnSizing,
    },
    enableRowSelection,
    enableColumnPinning: true,
    enableColumnResizing,
    columnResizeMode: 'onChange',
    onColumnSizingChange: setColumnSizing,
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
    onColumnPinningChange: setInternalPinning,

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
  const headerClassName = headerIsColored ? 'text-white' : 'text-foreground'

  /* Background applied to body rows. Sticky/pinned cells use `bg-inherit` so they
   * sit opaque on top of horizontally-scrolled content. */
  const rowBg = (index: number) =>
    zebraRows && index % 2 !== 0 ? 'bg-muted/25' : 'bg-card'

  return (
    <Card
      className={cn(
        // `min-w-0` lets the Card shrink inside a flex/grid container instead
        // of forcing the page to scroll horizontally when the inner table is
        // wider than its allotted space.
        'min-w-0 gap-0 overflow-hidden border-border py-0 shadow-sm',
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

      {/* shadcn `<Table>` already wraps in an overflow-x-auto container, so we
          just need `relative` here for the loading overlay positioning. */}
      <div className="relative w-full min-w-0">
        <Table
          // `table-layout: fixed` makes the column widths set on `<th>` the
          // single source of truth — required for column resizing and for the
          // sticky offsets used by pinned columns to match the visual layout.
          style={{
            tableLayout: 'fixed',
            width: table.getTotalSize(),
            minWidth: '100%',
          }}
        >
          <TableHeader
            className={cn(
              '[&_tr]:border-0',
              stickyHeader && 'sticky top-0 z-20',
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
                  const pin = header.column.getIsPinned()
                  const isLastLeftPinned = pin === 'left' && header.column.getIsLastColumn('left')
                  const isFirstRightPinned =
                    pin === 'right' && header.column.getIsFirstColumn('right')
                  const pinStyles = getPinningStyles(header.column)
                  const size = header.getSize()
                  // For pinned columns we MUST enforce the width so the
                  // sticky offset (which TanStack derives from
                  // `column.getSize()`) matches the actual rendered width.
                  // For non-pinned columns we still set width explicitly so
                  // `table-layout: fixed` honors per-column sizing (and resizing).
                  const sizingStyle: React.CSSProperties = pin
                    ? { width: size, minWidth: size, maxWidth: size }
                    : { width: size }
                  const canResize = header.column.getCanResize()
                  const isResizing = header.column.getIsResizing()
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        ...sizingStyle,
                        ...pinStyles,
                        backgroundColor: pin
                          ? headerIsColored
                            ? headerColor
                            : 'var(--card)'
                          : pinStyles.backgroundColor,
                        zIndex: pin ? 3 : pinStyles.zIndex,
                      }}
                      className={cn(
                        'relative h-8 overflow-hidden px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
                        headerIsColored ? 'text-white' : 'text-foreground',
                        meta?.numeric && 'text-right',
                        isLastLeftPinned &&
                          'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]',
                        isFirstRightPinned &&
                          'shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.18)]',
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}

                      {canResize && (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize column"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            header.getResizeHandler()(e)
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation()
                            header.getResizeHandler()(e)
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            header.column.resetSize()
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            'absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none',
                            'transition-colors',
                            headerIsColored
                              ? cn(
                                  'hover:bg-white/40',
                                  isResizing && 'bg-white/60',
                                )
                              : cn(
                                  'hover:bg-foreground/20',
                                  isResizing && 'bg-foreground/30',
                                ),
                          )}
                        />
                      )}
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
              table.getRowModel().rows.map((row: Row<TData>, index) => {
                const baseBg = rowBg(index)
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'border-b border-border/50 transition-colors',
                      baseBg,
                      onRowClick && 'cursor-pointer hover:bg-accent/40',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | DataTableColumnMeta<TData>
                        | undefined
                      const pin = cell.column.getIsPinned()
                      const isLastLeftPinned =
                        pin === 'left' && cell.column.getIsLastColumn('left')
                      const isFirstRightPinned =
                        pin === 'right' && cell.column.getIsFirstColumn('right')
                      const size = cell.column.getSize()
                      // Mirror the header sizing so sticky offsets match the
                      // visual column widths. With `table-layout: fixed` every
                      // cell needs an explicit width so resizing is honoured.
                      const sizingStyle: React.CSSProperties = pin
                        ? { width: size, minWidth: size, maxWidth: size }
                        : { width: size }
                      return (
                        <TableCell
                          key={cell.id}
                          style={{
                            ...sizingStyle,
                            ...getPinningStyles(cell.column),
                          }}
                          className={cn(
                            'overflow-hidden px-3 text-xs whitespace-nowrap',
                            rowPadding,
                            meta?.mono && 'font-mono',
                            meta?.numeric && 'text-right tabular-nums',
                            // Pinned cells must be opaque so the rest of the row
                            // doesn't bleed through while scrolling.
                            pin && baseBg,
                            isLastLeftPinned &&
                              'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]',
                            isFirstRightPinned &&
                              'shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.18)]',
                            meta?.cellClassName,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })
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
