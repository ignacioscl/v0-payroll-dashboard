'use client'

import * as React from 'react'
import type { Table } from '@tanstack/react-table'
import { Loader2, Search, X } from 'lucide-react'
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

  /** Slot rendered between the records counter and the right-side actions. */
  trailing?: React.ReactNode
  /** Slot rendered at the very start of the toolbar (before the records counter). */
  leading?: React.ReactNode
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
  trailing,
  leading,
}: DataTableToolbarProps<TData>) {
  const globalFilter = (table.getState().globalFilter as string) ?? ''
  const isFiltered =
    table.getState().columnFilters.length > 0 || globalFilter.length > 0
  const pageSize = table.getState().pagination.pageSize

  // Fallback: when server-side total isn't provided, use filtered row count.
  const total = totalRows ?? table.getFilteredRowModel().rows.length

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
              {total.toLocaleString()}
            </span>
          )}
          <span>record{total === 1 ? '' : 's'}</span>
        </div>

        {enableGlobalFilter && (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-4" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={globalFilter}
                onChange={(e) => table.setGlobalFilter(e.target.value)}
                placeholder={globalFilterPlaceholder}
                className="h-7 w-[180px] px-2 pl-7 text-[11px] sm:w-[240px]"
              />
              {globalFilter && (
                <button
                  type="button"
                  onClick={() => table.setGlobalFilter('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </>
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
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {trailing}

        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger size="sm" className="h-7 w-[58px] px-2 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
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
