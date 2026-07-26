'use client'

import * as React from 'react'
import type { Table } from '@tanstack/react-table'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTranslation } from '@/lib/i18n/locale-context'

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

/**
 * Column visibility dropdown — compact (h-7) with a visible count badge.
 */
export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const { t } = useTranslation()
  const hideableColumns = table
    .getAllColumns()
    .filter((c) => typeof c.accessorFn !== 'undefined' && c.getCanHide())

  if (hideableColumns.length === 0) return null

  const visibleCount = hideableColumns.filter((c) => c.getIsVisible()).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          aria-label={t('common.toggleColumns')}
        >
          <SlidersHorizontal className="size-3 text-primary" />
          {t('common.columns')}
          <Badge variant="secondary" className="ml-0 px-1 py-0 text-[10px]">
            {visibleCount}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuLabel className="text-xs">{t('common.toggleColumns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideableColumns.map((column) => {
          const label =
            (column.columnDef.meta as { label?: string } | undefined)?.label ??
            (typeof column.columnDef.header === 'string'
              ? column.columnDef.header
              : column.id)
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
              className="text-sm capitalize"
            >
              {label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
