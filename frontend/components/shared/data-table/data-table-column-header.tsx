'use client'

import * as React from 'react'
import type { Column } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  EyeOff,
  PinOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { DataTableColumnFilter } from './data-table-column-filter'
import type { ColumnFilterConfig } from './data-table-helpers'

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

/**
 * Sortable + hideable column header. Reads `meta.filter` from the column def
 * and renders the column-level filter icon when present. Uses `text-inherit`
 * so it adapts to both colored (white) and subtle (foreground) headers.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const meta = column.columnDef.meta as
    | { filter?: ColumnFilterConfig }
    | undefined
  const filterConfig = meta?.filter

  if (!column.getCanSort() && !column.getCanHide() && !filterConfig) {
    return <div className={cn('font-semibold', className)}>{title}</div>
  }

  const sorted = column.getIsSorted()

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {column.getCanSort() || column.getCanHide() ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                '-ml-2 h-7 gap-1 px-2 text-xs font-semibold uppercase tracking-wide',
                'text-inherit hover:bg-white/10 hover:text-inherit data-[state=open]:bg-white/15',
                'focus-visible:ring-0 focus-visible:ring-offset-0',
              )}
            >
              <span>{title}</span>
              {sorted === 'desc' ? (
                <ArrowDown className="ml-0.5 size-3" />
              ) : sorted === 'asc' ? (
                <ArrowUp className="ml-0.5 size-3" />
              ) : (
                <ArrowUpDown className="ml-0.5 size-3 opacity-40" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {column.getCanSort() && (
              <>
                <DropdownMenuItem
                  onClick={() => column.toggleSorting(false)}
                  disabled={sorted === 'asc'}
                >
                  <ArrowUp className="mr-2 size-3.5 text-muted-foreground" />
                  Sort ascending
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => column.toggleSorting(true)}
                  disabled={sorted === 'desc'}
                >
                  <ArrowDown className="mr-2 size-3.5 text-muted-foreground" />
                  Sort descending
                </DropdownMenuItem>
                {sorted && (
                  <DropdownMenuItem onClick={() => column.clearSorting()}>
                    <PinOff className="mr-2 size-3.5 text-muted-foreground" />
                    Clear sort
                  </DropdownMenuItem>
                )}
              </>
            )}
            {column.getCanSort() && column.getCanHide() && <DropdownMenuSeparator />}
            {column.getCanHide() && (
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOff className="mr-2 size-3.5 text-muted-foreground" />
                Hide column
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      )}

      {filterConfig && <DataTableColumnFilter column={column} config={filterConfig} />}
    </div>
  )
}
