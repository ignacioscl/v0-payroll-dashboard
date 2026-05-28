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
  type Table as TanStackTable,
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

type PinSide = false | 'left' | 'right'

/**
 * Single source of truth for column geometry, computed once per render from
 * `column.getSize()`. Avoids TanStack's separately-memoized `header.getSize()`,
 * `column.getStart()` and `column.getAfter()` — those caches can desync after a
 * resize, making the header read 80/240 while the body reads 60/243 and the
 * pinned columns drift on horizontal scroll.
 */
interface ColumnGeometry {
  /** Display-ordered leaf columns (left → center → right). */
  ordered: { id: string; size: number; pin: PinSide }[]
  size: Map<string, number>
  /** Rounded sticky `left` offset for each left-pinned column. */
  left: Map<string, number>
  /** Rounded sticky `right` offset for each right-pinned column. */
  right: Map<string, number>
  total: number
}

function buildColumnGeometry<TData>(table: TanStackTable<TData>): ColumnGeometry {
  const leftCols = table.getLeftVisibleLeafColumns()
  const centerCols = table.getCenterVisibleLeafColumns()
  const rightCols = table.getRightVisibleLeafColumns()

  const size = new Map<string, number>()
  const left = new Map<string, number>()
  const right = new Map<string, number>()
  const ordered: ColumnGeometry['ordered'] = []
  let total = 0

  const push = (id: string, s: number, pin: PinSide) => {
    size.set(id, s)
    ordered.push({ id, size: s, pin })
    total += s
  }

  // Left offsets accumulate left → right.
  let leftAcc = 0
  for (const c of leftCols) {
    const s = c.getSize()
    left.set(c.id, Math.round(leftAcc))
    leftAcc += s
    push(c.id, s, 'left')
  }
  for (const c of centerCols) push(c.id, c.getSize(), false)
  // Right offsets accumulate right → left.
  let rightAcc = 0
  for (let i = rightCols.length - 1; i >= 0; i--) {
    const c = rightCols[i]!
    const s = c.getSize()
    right.set(c.id, Math.round(rightAcc))
    rightAcc += s
  }
  for (const c of rightCols) push(c.id, c.getSize(), 'right')

  return { ordered, size, left, right, total }
}

/**
 * Sticky CSS for a BODY cell (`<td>`).
 * Only pinned cells stick (horizontally). Non-pinned cells are static.
 * z-index band (body): pinned = 1, non-pinned = auto(0).
 */
function getBodyCellStyle(
  pin: PinSide,
  geo: ColumnGeometry,
  columnId: string,
): React.CSSProperties {
  if (!pin) return {}
  if (pin === 'left') {
    return { position: 'sticky', left: `${geo.left.get(columnId) ?? 0}px`, zIndex: 1 }
  }
  return { position: 'sticky', right: `${geo.right.get(columnId) ?? 0}px`, zIndex: 1 }
}

/**
 * Sticky CSS for a HEADER cell (`<th>`).
 *
 * CRITICAL: every header cell handles BOTH axes itself (`top` for the sticky
 * header + `left`/`right` for pinned columns). The `<thead>`/`<tr>` must NOT be
 * `position: sticky` — a sticky `<th>` nested inside a sticky `<tr>` makes the
 * browser miscompute the horizontal offset, so pinned header cells drift away
 * from the body cells during horizontal scroll.
 *
 * z-index band (header, always above body): pinned = 4, non-pinned = 2.
 */
function getHeaderCellStyle(
  pin: PinSide,
  geo: ColumnGeometry,
  columnId: string,
  stickyHeader: boolean,
): React.CSSProperties {
  const style: React.CSSProperties = {}
  if (stickyHeader) {
    style.position = 'sticky'
    style.top = 0
    style.zIndex = 2
  }
  if (pin === 'left') {
    style.position = 'sticky'
    style.left = `${geo.left.get(columnId) ?? 0}px`
    style.zIndex = 4
  } else if (pin === 'right') {
    style.position = 'sticky'
    style.right = `${geo.right.get(columnId) ?? 0}px`
    style.zIndex = 4
  }
  return style
}

/** Solid header background for every `<th>` so scrolled columns don't show through. */
function getHeaderCellBackground(
  headerIsColored: boolean,
  headerColor: string,
): string {
  return headerIsColored ? headerColor : 'var(--card)'
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
  /* ---------- Persisted visibility ----------
   * Same SSR/hydration rule as column sizing below: start empty so the server
   * and first client render agree on the column set, then load the persisted
   * visibility after mount so colgroup + header + body update together. */
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const visibilityHydrated = React.useRef(false)
  React.useEffect(() => {
    const persisted = readPersistedVisibility(tableId)
    visibilityHydrated.current = true
    if (Object.keys(persisted).length) setColumnVisibility(persisted)
  }, [tableId])
  React.useEffect(() => {
    if (!visibilityHydrated.current) return
    persistVisibility(tableId, columnVisibility)
  }, [tableId, columnVisibility])

  /* ---------- Pinning (initial from meta.pin) ---------- */
  const initialPinning = React.useMemo(
    () => columnPinning ?? buildInitialPinning(columns),
    [columnPinning, columns],
  )
  const [internalPinning, setInternalPinning] = React.useState<ColumnPinningState>(initialPinning)
  // Re-sync when `columns` gain/lose `meta.pin` (e.g. actions column after auth loads).
  React.useEffect(() => {
    if (columnPinning) {
      setInternalPinning(columnPinning)
      return
    }
    setInternalPinning(buildInitialPinning(columns))
  }, [columns, columnPinning])

  /* ---------- Persisted column sizing ----------
   * IMPORTANT: do NOT read localStorage in the initializer. During SSR
   * `columnSizing` is `{}` (server can't see localStorage), so the server
   * renders the `<colgroup>`/`<thead>` at the default sizes. If we then seeded
   * the client's first render with persisted sizes, React would hydrate the
   * server's colgroup/header markup (default widths) but render the body with
   * the persisted widths — and since the initializer is not a state *change*,
   * nothing forces the colgroup/header to re-render. The result is a column
   * whose layout width (colgroup) differs from its sticky `left` offset (body),
   * so pinned columns "snap"/drift on horizontal scroll.
   *
   * Instead we start at `{}` (matching the server) and load the persisted sizes
   * in an effect after mount. That setState re-renders colgroup + header + body
   * together with identical numbers — the single-source-of-truth approach the
   * elescorial grid relies on. */
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})
  const sizingHydrated = React.useRef(false)
  React.useEffect(() => {
    const persisted = readPersistedSizing(tableId)
    sizingHydrated.current = true
    if (Object.keys(persisted).length) setColumnSizing(persisted)
  }, [tableId])
  React.useEffect(() => {
    // Skip the initial `{}` so we don't clobber stored sizes before the load
    // effect above has had a chance to run.
    if (!sizingHydrated.current) return
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

  /* Background applied to body rows. Pinned cells use a solid color via inline
   * `style.backgroundColor = 'var(--card)'` so horizontally-scrolled content
   * never bleeds through. Zebra striping only applies to non-pinned cells. */
  const rowBg = (index: number) =>
    zebraRows && index % 2 !== 0 ? 'bg-muted/25' : 'bg-card'

  /* ---------- Horizontal scroll sync (top mirror scrollbar) ----------
   * The native horizontal scrollbar lives at the bottom of the table, which
   * is far below the fold when there are many rows. We render a thin mirror
   * scrollbar above the header (`sticky top-0`) so users can scroll
   * horizontally without scrolling vertically first.  The two scroll
   * containers are kept in sync via `scrollLeft` assignments. */
  const mainScrollRef = React.useRef<HTMLDivElement>(null)
  const topScrollRef = React.useRef<HTMLDivElement>(null)
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = React.useState(false)

  const onTopScroll = React.useCallback(() => {
    const top = topScrollRef.current
    const main = mainScrollRef.current
    if (!top || !main) return
    if (main.scrollLeft !== top.scrollLeft) main.scrollLeft = top.scrollLeft
  }, [])

  const onMainScroll = React.useCallback(() => {
    const top = topScrollRef.current
    const main = mainScrollRef.current
    if (!top || !main) return
    if (top.scrollLeft !== main.scrollLeft) top.scrollLeft = main.scrollLeft
  }, [])

  React.useLayoutEffect(() => {
    const el = mainScrollRef.current
    if (!el) return
    const update = () => {
      setHasHorizontalOverflow(el.scrollWidth > el.clientWidth + 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const inner = el.querySelector('table')
    if (inner) ro.observe(inner)
    return () => ro.disconnect()
  }, [data, columnVisibility, columnSizing, internalPinning])

  // Single geometry source — colgroup, header and body all read from this so
  // their widths and sticky offsets can never desync.
  const geo = buildColumnGeometry(table)
  const totalTableWidth = geo.total
  // Fill the panel when there is extra space (e.g. sidebar collapsed). When
  // columns are wider than the viewport, `minWidth` enables horizontal scroll.
  // Pinned columns keep fixed widths via `<col>` + locked `<th>`/`<td>`; only
  // center columns absorb extra space so sticky offsets stay aligned.
  const tableWidthStyle: React.CSSProperties = {
    width: '100%',
    minWidth: totalTableWidth,
  }

  return (
    <Card
      className={cn(
        // `min-w-0` lets the Card shrink inside a flex/grid container instead
        // of forcing the page to scroll horizontally when the inner table is
        // wider than its allotted space.
        //
        // `overflow-clip` (not `overflow-hidden`) keeps the rounded corners
        // clipping but does NOT establish a scroll container — that's what
        // lets the inner `sticky top-0` horizontal scrollbar mirror stick to
        // the viewport instead of being trapped inside the Card.
        'min-w-0 gap-0 overflow-clip border-border py-0 shadow-sm',
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

      {/* Top horizontal scrollbar mirror — `position: sticky` makes it follow
          the user as the page scrolls so they never have to scroll past all
          rows to reach the native scrollbar at the bottom of the table.
          `top-16` keeps it just below the dashboard's 4rem-tall fixed page
          header. `aria-hidden` because the real scroll interaction is the
          one in `mainScrollRef` below — this one just mirrors `scrollLeft`. */}
      <div
        ref={topScrollRef}
        onScroll={onTopScroll}
        aria-hidden="true"
        className={cn(
          'sticky top-16 z-20 w-full overflow-x-auto overflow-y-hidden border-b border-border bg-card',
          // Reserve enough vertical space for any browser's horizontal
          // scrollbar; on macOS the bar is overlay/auto-hiding, so the strip
          // looks empty most of the time which is fine.
          hasHorizontalOverflow ? 'h-3.5' : 'h-0 border-b-0',
        )}
      >
        <div style={{ ...tableWidthStyle, height: 1 }} />
      </div>

      <div
        className={cn(
          'relative w-full min-w-0',
          isLoading && data.length === 0 && 'min-h-32',
        )}
      >
        <div
          ref={mainScrollRef}
          onScroll={onMainScroll}
          className="relative w-full overflow-x-auto"
        >
        <table
          data-slot="table"
          // `table-layout: fixed` makes the column widths set on `<th>` the
          // single source of truth — required for column resizing and for the
          // sticky offsets used by pinned columns to match the visual layout.
          className="w-full caption-bottom text-sm"
          style={{
            tableLayout: 'fixed',
            ...tableWidthStyle,
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <colgroup>
            {geo.ordered.map((c) => (
              <col
                key={c.id}
                // Pinned: fixed width for sticky offsets. Center: no width →
                // grows to fill remaining space when the table is `width: 100%`.
                style={c.pin ? { width: c.size } : undefined}
              />
            ))}
          </colgroup>
          {/* NOTE: no `sticky` here — each `<th>` sticks on both axes itself
              (see getHeaderCellStyle). A sticky thead + sticky th drifts. */}
          <TableHeader
            className={cn('[&_tr]:border-0', headerClassName)}
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
                  const stickyStyle = getHeaderCellStyle(
                    pin,
                    geo,
                    header.column.id,
                    stickyHeader,
                  )
                  // Pinned cells lock width (from the shared geometry) so the
                  // sticky offset matches the rendered column exactly.
                  const size = geo.size.get(header.column.id) ?? header.getSize()
                  const sizingStyle = pin
                    ? { width: size, minWidth: size, maxWidth: size }
                    : undefined
                  const canResize = header.column.getCanResize()
                  const isResizing = header.column.getIsResizing()
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        ...stickyStyle,
                        ...(sizingStyle ?? {}),
                        backgroundColor: getHeaderCellBackground(
                          headerIsColored,
                          headerColor,
                        ),
                        ...(isLastLeftPinned
                          ? { boxShadow: 'inset -4px 0 8px -4px rgba(0,0,0,0.14)' }
                          : {}),
                        ...(isFirstRightPinned
                          ? { boxShadow: 'inset 4px 0 8px -4px rgba(0,0,0,0.14)' }
                          : {}),
                      }}
                      className={cn(
                        'relative box-border h-8 overflow-hidden px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
                        headerIsColored ? 'text-white' : 'text-foreground',
                        meta?.numeric && 'text-right',
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
                          className="group absolute top-0 -right-px z-10 h-full w-2 cursor-col-resize touch-none select-none"
                        >
                          {/* On the real column edge — no transform (transform on
                              sticky ancestors causes scroll jitter). */}
                          <span
                            aria-hidden="true"
                            className={cn(
                              'pointer-events-none absolute top-[20%] bottom-[20%] right-0 block w-px transition-all group-hover:top-0 group-hover:bottom-0',
                              headerIsColored
                                ? 'bg-white/40 group-hover:bg-white'
                                : 'bg-foreground/30 group-hover:bg-foreground/80',
                              isResizing &&
                                cn(
                                  'inset-y-0 w-0.5',
                                  headerIsColored
                                    ? 'bg-white'
                                    : 'bg-foreground/80',
                                ),
                            )}
                          />
                        </span>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading && data.length === 0 ? (
              /* Spacer only — spinner is in the viewport overlay below so wide
                 pinned tables don't center the loader thousands of px to the right. */
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell
                  colSpan={visibleColCount}
                  className="h-32 border-0 p-0"
                  aria-hidden
                />
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
                      // Width + sticky offset both read from the shared
                      // geometry so header and body can never diverge.
                      const size = geo.size.get(cell.column.id) ?? cell.column.getSize()
                      const sizingStyle = pin
                        ? { width: size, minWidth: size, maxWidth: size }
                        : undefined
                      const cellPinStyles = getBodyCellStyle(pin, geo, cell.column.id)
                      return (
                        <TableCell
                          key={cell.id}
                          style={{
                            ...cellPinStyles,
                            ...(sizingStyle ?? {}),
                            backgroundColor: pin
                              ? 'var(--card)'
                              : cellPinStyles.backgroundColor,
                            ...(isLastLeftPinned
                              ? { boxShadow: 'inset -4px 0 8px -4px rgba(0,0,0,0.14)' }
                              : {}),
                            ...(isFirstRightPinned
                              ? { boxShadow: 'inset 4px 0 8px -4px rgba(0,0,0,0.14)' }
                              : {}),
                          }}
                          className={cn(
                            'box-border overflow-hidden px-3 text-xs whitespace-nowrap',
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
                )
              })
            )}
          </TableBody>
        </table>
        </div>

        {isLoading && data.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

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
