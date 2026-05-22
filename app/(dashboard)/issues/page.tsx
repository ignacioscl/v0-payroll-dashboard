'use client'

import { useState, useMemo } from 'react'
import {
  issues,
  getEmployeeById,
  getAgencyById
} from '@/lib/mock-data'
import type { IssueType, IssueStatus } from '@/lib/types'
import { useFilters } from '@/lib/filter-context'
import { EmployeeAvatar } from '@/components/employees/employee-avatar'
import { IssueTypeBadge, StatusBadge } from '@/components/shared/status-badge'
import { TimeDiffBadge } from '@/components/shared/time-diff-badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
  LogOut,
  Hand,
  Trash2,
  DollarSign,
  UtensilsCrossed,
  SlidersHorizontal,
  Download,
  FileSpreadsheet,
  TrendingUp,
  CheckCircle2,
  Clock4,
} from 'lucide-react'
import { format } from 'date-fns'

type SortField = 'date' | 'employee' | 'agency' | 'type' | 'status' | 'minutesDiff'
type SortDirection = 'asc' | 'desc'

type ColumnKey = 'employee' | 'dealer' | 'date' | 'issue' | 'expected' | 'actual' | 'difference' | 'status'

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'employee', label: 'Employee' },
  { key: 'dealer', label: 'Dealer' },
  { key: 'date', label: 'Date' },
  { key: 'issue', label: 'Issue Type' },
  { key: 'expected', label: 'Expected Time' },
  { key: 'actual', label: 'Actual Time' },
  { key: 'difference', label: 'Difference' },
  { key: 'status', label: 'Status' },
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

export default function IssuesPage() {
  const { search, selectedDealer, selectedType, setSelectedType, selectedStatus, dateRange } = useFilters()

  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(ALL_COLUMNS.map(c => c.key))
  )

  const issueStats = useMemo(() => {
    const missingLunchIssues = issues.filter(i => i.type === 'missing_lunch_out' || i.type === 'missing_lunch_in')
    const missingClockOutIssues = issues.filter(i => i.type === 'missing_clock_out' || i.type === 'missing_exit')
    const manualPunchIssues = issues.filter(i => i.type === 'manual_punch')
    const deletedPunchIssues = issues.filter(i => i.type === 'deleted_punch')
    const modifiedPaymentIssues = issues.filter(i => i.type === 'modified_payment')

    return {
      missingLunch: {
        total: missingLunchIssues.length,
        fixed: missingLunchIssues.filter(i => i.status === 'reviewed' || i.status === 'justified').length,
        pending: missingLunchIssues.filter(i => i.status === 'pending').length,
      },
      missingClockOut: {
        total: missingClockOutIssues.length,
        fixed: missingClockOutIssues.filter(i => i.status === 'reviewed' || i.status === 'justified').length,
        pending: missingClockOutIssues.filter(i => i.status === 'pending').length,
      },
      manualPunch: manualPunchIssues.length,
      deletedPunch: deletedPunchIssues.length,
      modifiedPayment: modifiedPaymentIssues.length,
    }
  }, [])

  const filteredIssues = useMemo(() => {
    let result = [...issues]

    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(issue => {
        const employee = getEmployeeById(issue.employeeId)
        const agency = getAgencyById(issue.agencyId)
        return (
          employee?.firstName.toLowerCase().includes(searchLower) ||
          employee?.lastName.toLowerCase().includes(searchLower) ||
          employee?.id.toLowerCase().includes(searchLower) ||
          agency?.name.toLowerCase().includes(searchLower)
        )
      })
    }

    if (selectedDealer !== 'all') {
      result = result.filter(issue => issue.agencyId === selectedDealer)
    }
    if (selectedType !== 'all') {
      result = result.filter(issue => issue.type === selectedType)
    }
    if (selectedStatus !== 'all') {
      result = result.filter(issue => issue.status === selectedStatus)
    }
    if (dateRange?.from) {
      result = result.filter(issue => {
        const issueDate = new Date(issue.date)
        if (dateRange.to) return issueDate >= dateRange.from! && issueDate <= dateRange.to
        return issueDate >= dateRange.from!
      })
    }

    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime()
          break
        case 'employee':
          const empA = getEmployeeById(a.employeeId)
          const empB = getEmployeeById(b.employeeId)
          comparison = (empA?.firstName || '').localeCompare(empB?.firstName || '')
          break
        case 'agency':
          const agA = getAgencyById(a.agencyId)
          const agB = getAgencyById(b.agencyId)
          comparison = (agA?.name || '').localeCompare(agB?.name || '')
          break
        case 'type':
          comparison = a.type.localeCompare(b.type)
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'minutesDiff':
          comparison = (a.minutesDiff || 0) - (b.minutesDiff || 0)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [search, selectedDealer, selectedType, selectedStatus, dateRange, sortField, sortDirection])

  const totalPages = Math.ceil(filteredIssues.length / pageSize)
  const paginatedIssues = filteredIssues.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  const pageNumbers = generatePageNumbers(pageIndex + 1, totalPages)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
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
    const rows = filteredIssues.map(issue => {
      const employee = getEmployeeById(issue.employeeId)
      const agency = getAgencyById(issue.agencyId)
      return [
        employee?.id || '',
        employee ? `${employee.firstName} ${employee.lastName}` : '',
        agency?.name || '',
        issue.date,
        issue.type,
        issue.expectedTime || '',
        issue.actualTime || '',
        issue.minutesDiff?.toString() || '',
        issue.status,
      ]
    })
    const headers = ['Employee ID', 'Employee Name', 'Dealer', 'Date', 'Issue Type', 'Expected', 'Actual', 'Diff (min)', 'Status']
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'punch-issues.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 ml-1.5 opacity-40" />
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5 ml-1.5 text-white" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1.5 text-white" />
  }

  const totalPending = issues.filter(i => i.status === 'pending').length
  const totalResolved = issues.filter(i => i.status !== 'pending').length

  return (
    <div className="space-y-6">

      {/* ── Page Header ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 ring-1 ring-red-200">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Punch Issues</h1>
            <p className="text-sm text-muted-foreground">Records of employees with punch clock problems</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
            <Clock4 className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-medium">{totalPending} pending</span>
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span className="font-medium">{totalResolved} resolved</span>
          </Badge>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">

        {/* Missing Lunch */}
        <Card
          className="cursor-pointer border-border hover:border-orange-300 hover:shadow-sm transition-all group"
          onClick={() => setSelectedType('missing_lunch_out')}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                <UtensilsCrossed className="h-4 w-4 text-orange-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.missingLunch.total}</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Missing Lunch</p>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full transition-all"
                style={{ width: `${issueStats.missingLunch.total > 0 ? (issueStats.missingLunch.fixed / issueStats.missingLunch.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-green-600 font-medium">{issueStats.missingLunch.fixed} fixed</span>
              <span className="text-[11px] text-orange-600 font-medium">{issueStats.missingLunch.pending} pending</span>
            </div>
          </CardContent>
        </Card>

        {/* Missing Clock Out */}
        <Card
          className="cursor-pointer border-border hover:border-red-300 hover:shadow-sm transition-all group"
          onClick={() => setSelectedType('missing_clock_out')}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                <LogOut className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.missingClockOut.total}</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Missing Clock Out</p>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-red-400 rounded-full transition-all"
                style={{ width: `${issueStats.missingClockOut.total > 0 ? (issueStats.missingClockOut.fixed / issueStats.missingClockOut.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-green-600 font-medium">{issueStats.missingClockOut.fixed} fixed</span>
              <span className="text-[11px] text-red-600 font-medium">{issueStats.missingClockOut.pending} pending</span>
            </div>
          </CardContent>
        </Card>

        {/* Manual Punch */}
        <Card
          className="cursor-pointer border-border hover:border-blue-300 hover:shadow-sm transition-all group"
          onClick={() => setSelectedType('manual_punch')}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Hand className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.manualPunch}</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Manual Punch</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-blue-500" />
              <span className="text-[11px] text-muted-foreground">manual overrides</span>
            </div>
          </CardContent>
        </Card>

        {/* Deleted Punch */}
        <Card
          className="cursor-pointer border-border hover:border-purple-300 hover:shadow-sm transition-all group"
          onClick={() => setSelectedType('deleted_punch')}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <Trash2 className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.deletedPunch}</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Deleted Punch</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-purple-500" />
              <span className="text-[11px] text-muted-foreground">removed entries</span>
            </div>
          </CardContent>
        </Card>

        {/* Modified Payment */}
        <Card
          className="cursor-pointer border-border hover:border-emerald-300 hover:shadow-sm transition-all group"
          onClick={() => setSelectedType('modified_payment')}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.modifiedPayment}</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Modified Payment</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span className="text-[11px] text-muted-foreground">pay adjustments</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Table Card ──────────────────────────────────── */}
      <Card className="border-border shadow-sm">

        {/* Toolbar */}
        <CardHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{filteredIssues.length}</span>
              <span>records found</span>
              {filteredIssues.length !== issues.length && (
                <Badge variant="secondary" className="text-[11px] px-1.5 py-0">filtered</Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Rows per page */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => { setPageSize(Number(value)); setPageIndex(0) }}
                >
                  <SelectTrigger className="h-8 w-[70px] text-xs">
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

              <Separator orientation="vertical" className="h-6" />

              {/* Column visibility */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Columns
                    <Badge variant="secondary" className="text-[11px] px-1.5 py-0 ml-0.5">
                      {visibleColumns.size}
                    </Badge>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs">Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map(col => (
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

              {/* Export */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={handleExportCSV}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
                Export Excel
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Table */}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1565C0] hover:bg-[#1565C0] border-none">
                {visibleColumns.has('employee') && (
                  <TableHead className="text-white font-medium px-4 py-3 h-auto">
                    <button className="flex items-center hover:text-white/80 transition-colors" onClick={() => handleSort('employee')}>
                      Employee <SortIcon field="employee" />
                    </button>
                  </TableHead>
                )}
                {visibleColumns.has('dealer') && (
                  <TableHead className="text-white font-medium px-4 py-3 h-auto">
                    <button className="flex items-center hover:text-white/80 transition-colors" onClick={() => handleSort('agency')}>
                      Dealer <SortIcon field="agency" />
                    </button>
                  </TableHead>
                )}
                {visibleColumns.has('date') && (
                  <TableHead className="text-white font-medium px-4 py-3 h-auto">
                    <button className="flex items-center hover:text-white/80 transition-colors" onClick={() => handleSort('date')}>
                      Date <SortIcon field="date" />
                    </button>
                  </TableHead>
                )}
                {visibleColumns.has('issue') && (
                  <TableHead className="text-white font-medium px-4 py-3 h-auto">
                    <button className="flex items-center hover:text-white/80 transition-colors" onClick={() => handleSort('type')}>
                      Issue <SortIcon field="type" />
                    </button>
                  </TableHead>
                )}
                {visibleColumns.has('expected') && (
                  <TableHead className="text-white font-medium px-4 py-3 h-auto">Expected</TableHead>
                )}
                {visibleColumns.has('actual') && (
                  <TableHead className="text-white font-medium px-4 py-3 h-auto">Actual</TableHead>
                )}
                {visibleColumns.has('difference') && (
                  <TableHead className="text-white font-medium px-4 py-3 h-auto">
                    <button className="flex items-center hover:text-white/80 transition-colors" onClick={() => handleSort('minutesDiff')}>
                      Difference <SortIcon field="minutesDiff" />
                    </button>
                  </TableHead>
                )}
                {visibleColumns.has('status') && (
                  <TableHead className="text-white font-medium px-4 py-3 h-auto">
                    <button className="flex items-center hover:text-white/80 transition-colors" onClick={() => handleSort('status')}>
                      Status <SortIcon field="status" />
                    </button>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedIssues.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.size}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <AlertTriangle className="h-8 w-8 opacity-20" />
                      <span>No issues found matching your filters.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedIssues.map((issue, index) => {
                  const employee = getEmployeeById(issue.employeeId)
                  const agency = getAgencyById(issue.agencyId)
                  if (!employee || !agency) return null

                  return (
                    <TableRow
                      key={issue.id}
                      className={`border-b border-border/60 transition-colors ${index % 2 === 0 ? '' : 'bg-muted/30'}`}
                    >
                      {visibleColumns.has('employee') && (
                        <TableCell className="px-4 py-2.5">
                          <EmployeeAvatar employee={employee} size="sm" showName showPosition />
                        </TableCell>
                      )}
                      {visibleColumns.has('dealer') && (
                        <TableCell className="px-4 py-2.5">
                          <p className="text-sm font-medium text-foreground">{agency.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {employee.id}</p>
                        </TableCell>
                      )}
                      {visibleColumns.has('date') && (
                        <TableCell className="px-4 py-2.5">
                          <p className="text-sm text-foreground">{format(new Date(issue.date), 'MMM dd, yyyy')}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(issue.date), 'EEEE')}</p>
                        </TableCell>
                      )}
                      {visibleColumns.has('issue') && (
                        <TableCell className="px-4 py-2.5">
                          <IssueTypeBadge type={issue.type} />
                        </TableCell>
                      )}
                      {visibleColumns.has('expected') && (
                        <TableCell className="px-4 py-2.5">
                          <span className="text-sm font-mono text-foreground">{issue.expectedTime || '—'}</span>
                        </TableCell>
                      )}
                      {visibleColumns.has('actual') && (
                        <TableCell className="px-4 py-2.5">
                          <span className="text-sm font-mono text-foreground">{issue.actualTime || '—'}</span>
                        </TableCell>
                      )}
                      {visibleColumns.has('difference') && (
                        <TableCell className="px-4 py-2.5">
                          <TimeDiffBadge minutes={issue.minutesDiff} />
                        </TableCell>
                      )}
                      {visibleColumns.has('status') && (
                        <TableCell className="px-4 py-2.5">
                          <StatusBadge status={issue.status} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>

        {/* ── Pagination ──────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-muted-foreground shrink-0">
              Showing{' '}
              <span className="font-medium text-foreground">
                {pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, filteredIssues.length)}
              </span>{' '}
              of{' '}
              <span className="font-medium text-foreground">{filteredIssues.length}</span>{' '}
              records
            </p>

            <Pagination className="w-auto mx-0">
              <PaginationContent className="gap-0.5">
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => { e.preventDefault(); if (pageIndex > 0) setPageIndex(p => p - 1) }}
                    className={pageIndex === 0 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                  />
                </PaginationItem>

                {pageNumbers.map((page, i) =>
                  page === 'ellipsis' ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        isActive={page === pageIndex + 1}
                        onClick={(e) => { e.preventDefault(); setPageIndex(page - 1) }}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}

                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => { e.preventDefault(); if (pageIndex < totalPages - 1) setPageIndex(p => p + 1) }}
                    className={pageIndex >= totalPages - 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </Card>
    </div>
  )
}
