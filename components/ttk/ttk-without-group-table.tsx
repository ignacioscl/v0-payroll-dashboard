'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useFilters } from '@/lib/filter-context'
import { useTtkList } from '@/hooks/use-ttk-list'
import type { TtkListRow } from '@/lib/ttk/ttk-list-types'
import {
  formatDurationDisplay,
  formatGmtDate,
  formatGmtTime,
} from '@/lib/ttk/map-header-filters'
import { EmployeeThumbnail } from '@/components/ttk/employee-thumbnail'
import { PunchErrorIndicator } from '@/components/ttk/punch-error-indicator'
import { PunchFixedIndicator } from '@/components/ttk/punch-fixed-indicator'
import { PunchManualIndicator } from '@/components/ttk/punch-manual-indicator'
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
  Pencil,
  Trash2,
  CheckCircle,
  Images,
  Info,
} from 'lucide-react'
import { EditPunchDialog } from '@/components/ttk/edit-punch-dialog'
import { PunchLogDialog } from '@/components/ttk/punch-log-dialog'
import {
  buildPunchFacePhotoValidation,
  PunchFacePhotosDialog,
} from '@/components/ttk/punch-face-photos-dialog'
import { hasFaceValidationPhotos } from '@/lib/ttk/punch-method'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAddOrEditPunch, canDeletePunch } from '@/lib/auth/ttk-permissions'
import { useTtkDeletePunch } from '@/hooks/use-ttk-delete-punch'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { toast } from 'sonner'
import { PunchDeleteConfirmDialog } from '@/components/ttk/punch-delete-confirm-dialog'

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

function punchErrorLabel(row: TtkListRow): string | null {
  const res = row.badPunch?.res?.trim()
  return res ? res : null
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
  const [editingPunch, setEditingPunch] = useState<{
    id: number | string
    employeeName: string
    punchIn?: string | null
    breakStart?: string | null
    breakEnd?: string | null
    punchOut?: string | null
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number | string
    employeeName: string
    punchDateLabel: string
    action: 'delete' | 'activate'
  } | null>(null)
  const [logTarget, setLogTarget] = useState<{
    id: number | string
    employeeName: string
    punchDateLabel: string
  } | null>(null)
  const [photoTarget, setPhotoTarget] = useState<{
    employeeName: string
    punchDateLabel: string
    validation: ReturnType<typeof buildPunchFacePhotoValidation>
  } | null>(null)

  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const deleteMutation = useTtkDeletePunch()
  const canEdit = canAddOrEditPunch(hasPermission, user?.isSystemAdmin)
  const canDelete = canDeletePunch(hasPermission, user?.isSystemAdmin)
  const showActions = !meLoading

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

  const confirmDeletePunch = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({
        id_ttk: deleteTarget.id,
        action: deleteTarget.action,
      })
      toast.success(
        deleteTarget.action === 'activate'
          ? `Punch restored for ${deleteTarget.employeeName}`
          : `Punch deleted for ${deleteTarget.employeeName}`,
      )
      setDeleteTarget(null)
    } catch (e: unknown) {
      toast.error(getSrsErrorMessage(e, 'Failed to update punch'))
    }
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
      if (visibleColumns.has('timeWork')) cells.push(formatDurationDisplay(row.timeWork))
      if (visibleColumns.has('timeBreak')) cells.push(formatDurationDisplay(row.timeBreak))
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
                  <button type="button" className="flex cursor-pointer items-center hover:text-white/80" onClick={() => handleSort('employee')}>
                    Employee <SortIcon field="employee" />
                  </button>
                </TableHead>
              )}
              {visibleColumns.has('role') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">Role / Dept</TableHead>
              )}
              {visibleColumns.has('date') && (
                <TableHead className="h-8 px-3 py-1.5 text-xs font-semibold text-white">
                  <button type="button" className="flex cursor-pointer items-center hover:text-white/80" onClick={() => handleSort('date')}>
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
              {showActions && (
                <TableHead className="h-8 min-w-[72px] px-3 py-1.5 text-right text-xs font-semibold text-white">
                  Actions
                </TableHead>
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.size + (showActions ? 1 : 0)} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.size + (showActions ? 1 : 0)} className="h-24 text-center text-muted-foreground">
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
                      <div className="flex items-center gap-2 min-w-0">
                        <EmployeeThumbnail
                          employeeId={getEmployeeId(row)}
                          employeeName={row.usuario?.nombre ?? '—'}
                          thumbnailUuid={getThumbnailUuid(row)}
                          onSaved={(uuid) => handleThumbnailSaved(getEmployeeId(row), uuid)}
                          size="sm"
                        />
                        <div className="min-w-0 flex flex-col gap-0.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{row.usuario?.nombre ?? '—'}</span>
                            {punchErrorLabel(row) ? (
                              <PunchErrorIndicator errorText={punchErrorLabel(row)!} />
                            ) : null}
                            {Number(row.manualCreate) === 1 ? <PunchManualIndicator /> : null}
                            {row.fixedAt ? (
                              <PunchFixedIndicator
                                fixedAt={row.fixedAt}
                                fixedByName={row.fixedBy?.nombre}
                                errorSnapshot={row.fixedErrorSnapshot}
                              />
                            ) : null}
                          </div>
                          {row.dealer?.razonSocial ? (
                            <span className="truncate text-[10px] font-normal text-muted-foreground">
                              {row.dealer.razonSocial}
                            </span>
                          ) : null}
                        </div>
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
                      {formatDurationDisplay(row.timeWork) || '—'}
                    </TableCell>
                  )}
                  {visibleColumns.has('timeBreak') && (
                    <TableCell className="px-3 py-1.5 font-mono text-xs">
                      {formatDurationDisplay(row.timeBreak) || '—'}
                    </TableCell>
                  )}
                  {showActions && (
                    <TableCell className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {hasFaceValidationPhotos(row) ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:bg-sky-500/10 hover:text-sky-600"
                            onClick={() =>
                              setPhotoTarget({
                                employeeName: row.usuario?.nombre ?? '',
                                punchDateLabel: formatGmtDate(row.punchInGmt0) || '—',
                                validation: buildPunchFacePhotoValidation(row),
                              })
                            }
                            aria-label={`View face recognition photos for ${row.usuario?.nombre ?? 'employee'}`}
                          >
                            <Images className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {row.hasLog === 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:bg-sky-500/10 hover:text-sky-600"
                            onClick={() =>
                              setLogTarget({
                                id: row.id,
                                employeeName: row.usuario?.nombre ?? '',
                                punchDateLabel: formatGmtDate(row.punchInGmt0) || '—',
                              })
                            }
                            aria-label={`View change log for ${row.usuario?.nombre ?? 'employee'}`}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canEdit && Number(row.estado ?? 1) === 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            onClick={() =>
                              setEditingPunch({
                                id: row.id,
                                employeeName: row.usuario?.nombre ?? '',
                                punchIn: row.punchInGmt0,
                                breakStart: row.breakStartGmt0,
                                breakEnd: row.breakEndGmt0,
                                punchOut: row.punchOutGmt0,
                              })
                            }
                            aria-label={`Edit punch for ${row.usuario?.nombre ?? 'employee'}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          Number(row.estado ?? 1) === 1 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  id: row.id,
                                  employeeName: row.usuario?.nombre ?? 'employee',
                                  punchDateLabel: formatGmtDate(row.punchInGmt0) || '—',
                                  action: 'delete',
                                })
                              }
                              aria-label={`Delete punch for ${row.usuario?.nombre ?? 'employee'}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600"
                              onClick={() =>
                                setDeleteTarget({
                                  id: row.id,
                                  employeeName: row.usuario?.nombre ?? 'employee',
                                  punchDateLabel: formatGmtDate(row.punchInGmt0) || '—',
                                  action: 'activate',
                                })
                              }
                              aria-label={`Activate punch for ${row.usuario?.nombre ?? 'employee'}`}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          )
                        )}
                      </div>
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

      <PunchFacePhotosDialog
        open={photoTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPhotoTarget(null)
        }}
        employeeName={photoTarget?.employeeName}
        punchDateLabel={photoTarget?.punchDateLabel}
        validation={photoTarget?.validation ?? null}
      />

      <PunchLogDialog
        open={logTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLogTarget(null)
        }}
        punchId={logTarget?.id ?? null}
        employeeName={logTarget?.employeeName}
        punchDateLabel={logTarget?.punchDateLabel}
      />

      {canEdit && (
        <EditPunchDialog
          open={editingPunch !== null}
          onOpenChange={(open) => {
            if (!open) setEditingPunch(null)
          }}
          punchId={editingPunch?.id ?? null}
          employeeName={editingPunch?.employeeName}
          initial={
            editingPunch
              ? {
                  punchIn: editingPunch.punchIn,
                  breakStart: editingPunch.breakStart,
                  breakEnd: editingPunch.breakEnd,
                  punchOut: editingPunch.punchOut,
                }
              : undefined
          }
        />
      )}

      <PunchDeleteConfirmDialog
        target={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onConfirm={confirmDeletePunch}
        pending={deleteMutation.isPending}
      />
    </Card>
  )
}
