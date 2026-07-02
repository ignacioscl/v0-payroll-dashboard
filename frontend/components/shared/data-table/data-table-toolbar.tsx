'use client'

import * as React from 'react'
import type { Table } from '@tanstack/react-table'
import { Filter, Loader2, Maximize2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTableViewOptions } from './data-table-view-options'
import { DataTableExport } from './data-table-export'
import { DATA_TABLE_PAGE_SIZE_ALL } from './data-table-helpers'
import { useTranslation } from '@/lib/i18n/locale-context'
import type {
  ColumnFilterValue,
  DateFilterOperator,
  NumberFilterOperator,
  TextFilterOperator,
} from './data-table-helpers'

interface DataTableToolbarProps<TData> {
  table: Table<TData>

  /** Total rows known (server-side). Falls back to filtered row count. */
  totalRows?: number
  /** Shows a spinner next to the records counter while the data is refreshing. */
  isLoading?: boolean

  enableGlobalFilter?: boolean
  globalFilterPlaceholder?: string

  enableViewOptions?: boolean
  enableExport?: boolean
  exportFileName?: string
  fetchAllRowsForExport?: () => Promise<TData[]>

  pageSizeOptions?: number[]
  /** Adds an "All" option (server-side: `length: -1`). */
  includeAllPageSize?: boolean

  /** Slot rendered between the records counter and the right-side actions. */
  trailing?: React.ReactNode
  /** Slot rendered at the very start of the toolbar (before the records counter). */
  leading?: React.ReactNode

  /** When set, overrides the toolbar records counter (e.g. total WOs on grouped tables). */
  recordsCount?: number
  /** Label after the records counter when `recordsCount` is set. */
  recordsCountLabel?: string

  /** Scroll the table card below the fixed nav so it fills the viewport. */
  enableTableFocus?: boolean
  onFocusTable?: () => void
}

export function DataTableToolbar<TData>({
  table,
  totalRows,
  isLoading = false,
  enableGlobalFilter = true,
  globalFilterPlaceholder = 'Search…',
  enableViewOptions = true,
  enableExport = true,
  exportFileName,
  fetchAllRowsForExport,
  pageSizeOptions = [10, 25, 50, 100],
  includeAllPageSize = false,
  trailing,
  leading,
  recordsCount,
  recordsCountLabel,
  enableTableFocus = false,
  onFocusTable,
}: DataTableToolbarProps<TData>) {
  const { t } = useTranslation()
  const globalFilter = (table.getState().globalFilter as string) ?? ''
  const columnFilters = table.getState().columnFilters
  const isFiltered = columnFilters.length > 0 || globalFilter.length > 0
  const pageSize = table.getState().pagination.pageSize

  const textOperatorLabels = React.useMemo(
    (): Record<TextFilterOperator, string> => ({
      contains: t('dataTable.contains'),
      not_contains: t('dataTable.notContains'),
      starts_with: t('dataTable.startsWith'),
      ends_with: t('dataTable.endsWith'),
      equals: t('dataTable.equals'),
      not_equals: t('dataTable.notEquals'),
    }),
    [t],
  )

  const numberOperatorLabels = React.useMemo(
    (): Record<NumberFilterOperator, string> => ({
      eq: t('dataTable.eqNumber'),
      neq: t('dataTable.neNumber'),
      lt: t('dataTable.ltNumber'),
      lte: t('dataTable.lteNumber'),
      gt: t('dataTable.gtNumber'),
      gte: t('dataTable.gteNumber'),
    }),
    [t],
  )

  const dateOperatorLabels = React.useMemo(
    (): Record<DateFilterOperator, string> => ({
      eq: t('dataTable.onDate'),
      lt: t('dataTable.beforeDate'),
      lte: t('dataTable.onOrBeforeDate'),
      gt: t('dataTable.afterDate'),
      gte: t('dataTable.onOrAfterDate'),
    }),
    [t],
  )

  const operatorLabel = (v: ColumnFilterValue): string => {
    if (v.type === 'text') return textOperatorLabels[v.operator]
    if (v.type === 'number') return numberOperatorLabels[v.operator]
    return dateOperatorLabels[v.operator]
  }

  const columnLabel = (columnId: string): string => {
    const col = table.getColumn(columnId)
    if (!col) return columnId
    const meta = col.columnDef.meta as { label?: string } | undefined
    if (meta?.label) return meta.label
    if (typeof col.columnDef.header === 'string') return col.columnDef.header
    return columnId
  }

  // Fallback: when server-side total isn't provided, use filtered row count.
  const rowTotal = totalRows ?? table.getFilteredRowModel().rows.length
  const displayTotal = recordsCount ?? rowTotal
  const displayLabel =
    recordsCountLabel ??
    (displayTotal === 1 ? t('common.record') : t('common.records'))
  const searchPlaceholder = globalFilterPlaceholder ?? t('common.searchPlaceholder')

  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-muted/25 px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {leading}

        {/* Records counter */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span className="font-semibold tabular-nums text-foreground">
              {displayTotal.toLocaleString()}
            </span>
          )}
          <span>{displayLabel}</span>
        </div>

        {enableGlobalFilter && (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-4" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={globalFilter}
                onChange={(e) => table.setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-7 w-[180px] px-2 pl-7 text-[11px] sm:w-[240px]"
              />
              {globalFilter && (
                <button
                  type="button"
                  onClick={() => table.setGlobalFilter('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('common.clearSearch')}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </>
        )}

        {columnFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {columnFilters.map((f) => {
              const v = f.value as ColumnFilterValue | undefined
              if (!v) return null
              return (
                <Badge
                  key={f.id}
                  variant="secondary"
                  className="h-6 gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0 text-[10px] font-medium text-amber-800"
                >
                  <Filter className="size-2.5" />
                  <span className="font-semibold">{columnLabel(f.id)}</span>
                  <span className="text-amber-600">{operatorLabel(v)}</span>
                  <span className="rounded bg-white/70 px-1 font-mono">
                    {String(v.value ?? '')}
                  </span>
                  <button
                    type="button"
                    onClick={() => table.getColumn(f.id)?.setFilterValue(undefined)}
                    className="-mr-1 rounded p-0.5 hover:bg-amber-200"
                    aria-label={`Remove ${columnLabel(f.id)} filter`}
                  >
                    <X className="size-2.5" />
                  </button>
                </Badge>
              )
            })}
          </div>
        )}

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => {
              table.resetColumnFilters()
              table.setGlobalFilter('')
            }}
          >
            <X className="size-3" />
            {t('common.clearAll')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {enableTableFocus && onFocusTable ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px] cursor-pointer"
              onClick={onFocusTable}
              aria-label={t('common.fullScreen')}
              title={t('common.fullScreen')}
            >
              <Maximize2 className="size-3.5" />
              <span className="hidden sm:inline">{t('common.fullScreen')}</span>
            </Button>
            <Separator orientation="vertical" className="mx-0.5 h-4" />
          </>
        ) : null}

        {trailing}

        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">{t('common.rows')}</span>
          <Select
            value={
              pageSize === DATA_TABLE_PAGE_SIZE_ALL ? 'all' : String(pageSize)
            }
            onValueChange={(value) => {
              const nextPageSize =
                value === 'all' ? DATA_TABLE_PAGE_SIZE_ALL : Number(value)
              // Single update — separate setPageSize + setPageIndex reverts pageSize
              // when pagination is controlled (second call reads stale state).
              table.setPagination({ pageIndex: 0, pageSize: nextPageSize })
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-7 min-w-[58px] px-2 text-[11px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
              {includeAllPageSize ? (
                <SelectItem value="all">{t('common.all')}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>

        <Separator orientation="vertical" className="mx-0.5 h-4" />

        {enableViewOptions && <DataTableViewOptions table={table} />}

        {enableExport && (
          <DataTableExport
            table={table}
            fileName={exportFileName}
            fetchAllRows={fetchAllRowsForExport}
          />
        )}
      </div>
    </div>
  )
}
