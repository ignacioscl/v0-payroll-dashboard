'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useFilters } from '@/lib/filter-context'
import { useTtkList } from '@/hooks/use-ttk-list'
import type { TtkListRow } from '@/lib/ttk/ttk-list-types'
import { formatGmtDate, formatGmtTime } from '@/lib/ttk/map-header-filters'
import { EmployeeThumbnail } from '@/components/ttk/employee-thumbnail'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  SlidersHorizontal,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react'

type SortField = 'date' | 'employee'
type SortDirection = 'asc' | 'desc'

type ColumnKey =
  | 'employee'
  | 'role'
  | 'date'
  | 'punchIn'
  | 'breakStart'
  | 'breakEnd'
  | 'punchOut'
  | 'timeWork'
  | 'timeBreak'

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'employee', label: 'Employee' },
  { key: 'role', label: 'Role / Dept' },
  { key: 'date', label: 'Date' },
  { key: 'punchIn', label: 'Punch In' },
  { key: 'breakStart', label: 'Break Start' },
  { key: 'breakEnd', label: 'Break End' },
  { key: 'punchOut', label: 'Punch Out' },
  { key: 'timeWork', label: 'Time Work' },
  { key: 'timeBreak', label: 'Time Break' },
]

function generatePageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = []
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, 'ellipsis', total)
  } else if (current >= total - 3) {
    pages.push(1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total)
  } else {
    pages.push(1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total)
  }
  return pages
}

function sortToOrderBy(field: SortField, direction: SortDirection): string {
  if (field === 'employee') {
    return direction === 'asc' ? 'us.nombre' : 'us.nombre DESC'
  }
  return direction === 'asc' ? 'tew.punch_in' : 'tew.punch_in DESC'
}

function employeeLabel(row: TtkListRow, multiDealer: boolean): string {
  const name = row.usuario?.nombre ?? '—'
  if (multiDealer && row.dealer?.razonSocial) {
    return `${row.dealer.razonSocial} / ${name}`
  }
  return name
}

function roleLabel(row: TtkListRow): string {
  if (!row.rolDpto) return ''
  const parts = [row.rolDpto.role, row.rolDpto.department].filter(Boolean)
  return parts.join(' / ')
}

export function TtkWithoutGroupTable() {
  const {
    search,
    selectedDealers,
    selectedType,
    dateRange,
    filtersHydrated,
  } = useFilters()

  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(ALL_COLUMNS.map((c) => c.key)),
  )
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({})

  const getEmployeeId = useCallback((row: TtkListRow) => Number(row.usuario?.id ?? 0), [])

  const getThumbnailUuid = useCallback(
    (row: TtkListRow) => {
      const id = String(row.usuario?.id ?? '')
      if (id && thumbnailOverrides[id]) {
        return thumbnailOverrides[id]
      }
      return row.usuario?.thumbnailUuid ?? null
    },
    [thumbnailOverrides],
  )

  const handleThumbnailSaved = useCallback((employeeId: number, uuid: string) => {
    setThumbnailOverrides((prev) => ({ ...prev, [String(employeeId)]: uuid }))
  }, [])

  const orderBy = useMemo(
    () => sortToOrderBy(sortField, sortDirection),
    [sortField, sortDirection],
  )

  useEffect(() => {
    setPageIndex(0)
  }, [search, selectedDealers, selectedType, dateRange, pageSize, orderBy])

  const { rows, total, loading, error } = useTtkList({
    search,
    selectedDealers,
    dateRange,
    selectedType,
    pageIndex,
    pageSize,
    orderBy,
    filtersHydrated,
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageNumbers = generatePageNumbers(pageIndex + 1, totalPages)
  const multiDealer = selectedDealers.length > 1

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'date' ? 'desc' : 'asc')
    }
  }

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleExportCSV = () => {
    const headers = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key)).map((c) => c.label)
    const csvRows = rows.map((row) => {
      const cells: string[] = []
      if (visibleColumns.has('employee')) cells.push(employeeLabel(row, multiDealer))
      if (visibleColumns.has('role')) cells.push(roleLabel(row))
      if (visibleColumns.has('date')) cells.push(formatGmtDate(row.punchInGmt0))
      if (visibleColumns.has('punchIn')) cells.push(formatGmtTime(row.punchInGmt0))
      if (visibleColumns.has('breakStart')) cells.push(formatGmtTime(row.breakStartGmt0))
      if (visibleColumns.has('breakEnd')) cells.push(formatGmtTime(row.breakEndGmt0))
      if (visibleColumns.has('punchOut')) cells.push(formatGmtTime(row.punchOutGmt0))
      if (visibleColumns.has('timeWork')) cells.push(row.timeWork ?? '')
      if (visibleColumns.has('timeBreak')) cells.push(row.timeBreak ?? '')
      return cells
    })
    const csv = [headers, ...csvRows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ttk-without-group.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-40" />
    return sortDirection === 'asc'
      ? <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-white" />
      : <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-white" />
  }

  return (
    <Card className="gap-0 overflow-hidden border-border py-0 shadow-sm">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-muted/25 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span className="font-semibold tabular-nums text-foreground">{total}</span>
          )}
          <span>records</span>
          {filtersHydrated && selectedDealers.length === 0 && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">select dealers</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1">
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value))
                setPageIndex(0)
              }}
            >
              <SelectTrigger className="h-7 w-[58px] px-2 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator orientation="vertical" className="mx-0.5 h-4" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                <SlidersHorizontal className="h-3 w-3" />
                Columns
                <Badge variant="secondary" className="ml-0 px-1 py-0 text-[10px]">
                  {visibleColumns.size}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  className="text-sm"
                  checked={visibleColumns.has(col.key)}
                  onCheckedChange={() => toggleColumn(col.key)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={handleExportCSV}
            disabled={rows.length === 0}
          >
            <FileSpreadsheet className="h-3 w-3 text-green-600" />
            Export
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <CardContent className="p-0">
        <Table>
          <TableHeader className="[&_tr]:border-0">
            <TableRow className="border-0 bg-[#1565C0] hover:bg-[#1565C0]">
              {visibleColumns.has('employee') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">
                  <button type="button" className="flex items-center hover:text-white/80" onClick={() => handleSort('employee')}>
                    Employee <SortIcon field="employee" />
                  </button>
                </TableHead>
              )}
              {visibleColumns.has('role') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">Role / Dept</TableHead>
              )}
              {visibleColumns.has('date') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">
                  <button type="button" className="flex items-center hover:text-white/80" onClick={() => handleSort('date')}>
                    Date <SortIcon field="date" />
                  </button>
                </TableHead>
              )}
              {visibleColumns.has('punchIn') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">Punch In</TableHead>
              )}
              {visibleColumns.has('breakStart') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">Break Start</TableHead>
              )}
              {visibleColumns.has('breakEnd') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">Break End</TableHead>
              )}
              {visibleColumns.has('punchOut') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">Punch Out</TableHead>
              )}
              {visibleColumns.has('timeWork') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">Time Work</TableHead>
              )}
              {visibleColumns.has('timeBreak') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">Time Break</TableHead>
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.size} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.size} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <AlertTriangle className="h-8 w-8 opacity-20" />
                    <span>
                      {!filtersHydrated
                        ? 'Loading filters...'
                        : selectedDealers.length === 0
                          ? 'Select at least one dealer in the header.'
                          : 'No records for the current filters.'}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow
                  key={String(row.id)}
                  className={`border-b border-border/50 ${index % 2 === 0 ? '' : 'bg-muted/25'}`}
                >
                  {visibleColumns.has('employee') && (
                    <TableCell className="px-3 py-1.5 text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <EmployeeThumbnail
                          employeeId={getEmployeeId(row)}
                          employeeName={row.usuario?.nombre ?? '—'}
                          thumbnailUuid={getThumbnailUuid(row)}
                          onSaved={(uuid) => handleThumbnailSaved(getEmployeeId(row), uuid)}
                          size="sm"
                        />
                        <span>{employeeLabel(row, multiDealer)}</span>
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.has('role') && (
                    <TableCell className="px-3 py-1.5 text-xs text-muted-foreground">
                      {roleLabel(row) || '—'}
                    </TableCell>
                  )}
                  {visibleColumns.has('date') && (
                    <TableCell className="px-3 py-1.5 text-xs">
                      {formatGmtDate(row.punchInGmt0) || '—'}
                    </TableCell>
                  )}
                  {visibleColumns.has('punchIn') && (
                    <TableCell className="px-3 py-1.5 font-mono text-xs">
                      {formatGmtTime(row.punchInGmt0) || '—'}
                    </TableCell>
                  )}
                  {visibleColumns.has('breakStart') && (
                    <TableCell className="px-3 py-1.5 font-mono text-xs">
                      {formatGmtTime(row.breakStartGmt0) || '—'}
                    </TableCell>
                  )}
                  {visibleColumns.has('breakEnd') && (
                    <TableCell className="px-3 py-1.5 font-mono text-xs">
                      {formatGmtTime(row.breakEndGmt0) || '—'}
                    </TableCell>
                  )}
                  {visibleColumns.has('punchOut') && (
                    <TableCell className="px-3 py-1.5 font-mono text-xs">
                      {formatGmtTime(row.punchOutGmt0) || '—'}
                    </TableCell>
                  )}
                  {visibleColumns.has('timeWork') && (
                    <TableCell className="px-3 py-1.5 font-mono text-xs">
                      {row.timeWork === '00:00' ? '00:00' : row.timeWork || '—'}
                    </TableCell>
                  )}
                  {visibleColumns.has('timeBreak') && (
                    <TableCell className="px-3 py-1.5 font-mono text-xs">
                      {row.timeBreak || '—'}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5">
        <p className="shrink-0 text-[11px] text-muted-foreground">
          {total === 0 ? (
            'No records'
          ) : (
            <>
              <span className="font-medium tabular-nums text-foreground">
                {pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, total)}
              </span>
              {' '}of{' '}
              <span className="font-medium tabular-nums text-foreground">{total}</span>
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
                    if (pageIndex > 0) setPageIndex((p) => p - 1)
                  }}
                  className={`h-7 px-2 text-xs ${pageIndex === 0 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}`}
                />
              </PaginationItem>

              {pageNumbers.map((page, i) =>
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
                        setPageIndex(page - 1)
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
                    if (pageIndex < totalPages - 1) setPageIndex((p) => p + 1)
                  }}
                  className={`h-7 px-2 text-xs ${pageIndex >= totalPages - 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}`}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </Card>
  )
}
