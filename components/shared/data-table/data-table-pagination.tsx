'use client'

import * as React from 'react'
import type { Table } from '@tanstack/react-table'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  totalRows?: number
}

function generatePageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total]
  if (current >= total - 3) return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total]
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total]
}

/**
 * Compact paginated footer with numbered pages + ellipsis (matches the
 * existing TtkWithoutGroupTable look).
 */
export function DataTablePagination<TData>({
  table,
  totalRows,
}: DataTablePaginationProps<TData>) {
  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const pageCount = table.getPageCount()

  // Total — prefer the explicit server-side value, fallback to row count.
  const total = totalRows ?? table.getFilteredRowModel().rows.length
  const totalPages = Math.max(1, pageCount > 0 ? pageCount : Math.ceil(total / pageSize))
  const pages = generatePageNumbers(pageIndex + 1, totalPages)

  const start = total === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(total, (pageIndex + 1) * pageSize)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/15 px-3 py-1.5">
      <p className="shrink-0 text-[11px] text-muted-foreground">
        {total === 0 ? (
          'No records'
        ) : (
          <>
            <span className="font-medium tabular-nums text-foreground">
              {start.toLocaleString()}–{end.toLocaleString()}
            </span>{' '}
            of{' '}
            <span className="font-medium tabular-nums text-foreground">
              {total.toLocaleString()}
            </span>
          </>
        )}
      </p>

      {totalPages > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent className="gap-0.5">
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (table.getCanPreviousPage()) table.previousPage()
                }}
                className={`h-7 px-2 text-xs ${
                  !table.getCanPreviousPage()
                    ? 'pointer-events-none opacity-40'
                    : 'cursor-pointer'
                }`}
              />
            </PaginationItem>

            {pages.map((page, i) =>
              page === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis className="h-7 w-7" />
                </PaginationItem>
              ) : (
                <PaginationItem key={page}>
                  <PaginationLink
                    href="#"
                    isActive={page === pageIndex + 1}
                    onClick={(e) => {
                      e.preventDefault()
                      table.setPageIndex(page - 1)
                    }}
                    className="h-7 w-7 cursor-pointer text-xs"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (table.getCanNextPage()) table.nextPage()
                }}
                className={`h-7 px-2 text-xs ${
                  !table.getCanNextPage()
                    ? 'pointer-events-none opacity-40'
                    : 'cursor-pointer'
                }`}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
