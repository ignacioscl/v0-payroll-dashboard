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
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  LogOut,
  Hand,
  Trash2,
  DollarSign,
  UtensilsCrossed
} from 'lucide-react'
import { format } from 'date-fns'
import { ExportButton } from '@/components/shared/export-button'

type SortField = 'date' | 'employee' | 'agency' | 'type' | 'status' | 'minutesDiff'
type SortDirection = 'asc' | 'desc'

export default function IssuesPage() {
  // Get filters from global context
  const { search, selectedDealer, selectedType, setSelectedType, selectedStatus, dateRange } = useFilters()
  
  // Pagination
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Calculate issue stats for KPI cards with fixed/pending counts
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

  // Filter and sort issues
  const filteredIssues = useMemo(() => {
    let result = [...issues]

    // Search filter
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

    // Dealer filter
    if (selectedDealer !== 'all') {
      result = result.filter(issue => issue.agencyId === selectedDealer)
    }

    // Type filter
    if (selectedType !== 'all') {
      result = result.filter(issue => issue.type === selectedType)
    }

    // Status filter
    if (selectedStatus !== 'all') {
      result = result.filter(issue => issue.status === selectedStatus)
    }

    // Date range filter
    if (dateRange?.from) {
      result = result.filter(issue => {
        const issueDate = new Date(issue.date)
        if (dateRange.to) {
          return issueDate >= dateRange.from! && issueDate <= dateRange.to
        }
        return issueDate >= dateRange.from!
      })
    }

    // Sorting
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

  // Pagination calculations
  const totalPages = Math.ceil(filteredIssues.length / pageSize)
  const paginatedIssues = filteredIssues.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize
  )

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />
  }

  // Prepare export data
  const exportData = filteredIssues.map(issue => {
    const employee = getEmployeeById(issue.employeeId)
    const agency = getAgencyById(issue.agencyId)
    return {
      'Employee ID': employee?.id || '',
      'Employee Name': employee ? `${employee.firstName} ${employee.lastName}` : '',
      'Dealer': agency?.name || '',
      'Date': issue.date,
      'Issue Type': issue.type,
      'Expected Time': issue.expectedTime || '',
      'Actual Time': issue.actualTime || '',
      'Difference (min)': issue.minutesDiff || '',
      'Status': issue.status
    }
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <AlertTriangle className="h-7 w-7 text-red-500" />
            Punch Issues
          </h1>
          <p className="text-muted-foreground mt-1">
            Records of employees with punch clock problems
          </p>
        </div>
        <ExportButton 
          data={exportData}
          filename="punch-issues"
          title="Punch Issues Report"
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="bg-card border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedType('missing_lunch_out')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Missing Lunch</p>
                <p className="text-2xl font-bold text-foreground">{issueStats.missingLunch.total}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-green-600">Fixed: {issueStats.missingLunch.fixed}</span>
                  <span className="text-xs text-orange-600">Pending: {issueStats.missingLunch.pending}</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <UtensilsCrossed className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedType('missing_clock_out')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Missing Clock Out</p>
                <p className="text-2xl font-bold text-foreground">{issueStats.missingClockOut.total}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-green-600">Fixed: {issueStats.missingClockOut.fixed}</span>
                  <span className="text-xs text-red-600">Pending: {issueStats.missingClockOut.pending}</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <LogOut className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedType('manual_punch')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Manual Punch</p>
                <p className="text-2xl font-bold text-foreground">{issueStats.manualPunch}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Hand className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedType('deleted_punch')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Deleted Punch</p>
                <p className="text-2xl font-bold text-foreground">{issueStats.deletedPunch}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedType('modified_payment')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Modified Payment</p>
                <p className="text-2xl font-bold text-foreground">{issueStats.modifiedPayment}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {paginatedIssues.length} of {filteredIssues.length} records
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#1565C0] text-white">
                  <th className="px-4 py-3 text-left rounded-tl-md">
                    <button 
                      className="flex items-center text-xs font-medium hover:text-white/80"
                      onClick={() => handleSort('employee')}
                    >
                      Employee
                      <SortIcon field="employee" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button 
                      className="flex items-center text-xs font-medium hover:text-white/80"
                      onClick={() => handleSort('agency')}
                    >
                      Dealer
                      <SortIcon field="agency" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button 
                      className="flex items-center text-xs font-medium hover:text-white/80"
                      onClick={() => handleSort('date')}
                    >
                      Date
                      <SortIcon field="date" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button 
                      className="flex items-center text-xs font-medium hover:text-white/80"
                      onClick={() => handleSort('type')}
                    >
                      Issue
                      <SortIcon field="type" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium">
                    Expected
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium">
                    Actual
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button 
                      className="flex items-center text-xs font-medium hover:text-white/80"
                      onClick={() => handleSort('minutesDiff')}
                    >
                      Difference
                      <SortIcon field="minutesDiff" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left rounded-tr-md">
                    <button 
                      className="flex items-center text-xs font-medium hover:text-white/80"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      <SortIcon field="status" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedIssues.map((issue, index) => {
                  const employee = getEmployeeById(issue.employeeId)
                  const agency = getAgencyById(issue.agencyId)
                  if (!employee || !agency) return null

                  return (
                    <tr key={issue.id} className={`hover:bg-muted/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}>
                      <td className="px-4 py-3">
                        <EmployeeAvatar 
                          employee={employee} 
                          size="sm" 
                          showName 
                          showPosition
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{agency.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {employee.id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-foreground">
                            {format(new Date(issue.date), 'MMM dd, yyyy')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(issue.date), 'EEEE')}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <IssueTypeBadge type={issue.type} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground font-mono">
                          {issue.expectedTime || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground font-mono">
                          {issue.actualTime || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <TimeDiffBadge minutes={issue.minutesDiff} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={issue.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {pageIndex + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPageIndex(0)}
                disabled={pageIndex === 0}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPageIndex(pageIndex - 1)}
                disabled={pageIndex === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPageIndex(pageIndex + 1)}
                disabled={pageIndex >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPageIndex(totalPages - 1)}
                disabled={pageIndex >= totalPages - 1}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
