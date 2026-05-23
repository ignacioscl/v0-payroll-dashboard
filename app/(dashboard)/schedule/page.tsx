'use client'

import { useState, useMemo } from 'react'
import { 
  issues, 
  getEmployeeById, 
  getAgencyById 
} from '@/lib/mock-data'
import type { IssueType } from '@/lib/types'
import { issueTypeLabels, issueStatusLabels } from '@/lib/types'
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
  Clock
} from 'lucide-react'
import { format } from 'date-fns'
import { ExportButton } from '@/components/shared/export-button'

const scheduleIssueTypes: IssueType[] = ['late_arrival', 'early_departure', 'extended_lunch']

type SortField = 'date' | 'employee' | 'agency' | 'type' | 'minutesDiff' | 'status'
type SortDirection = 'asc' | 'desc'

export default function SchedulePage() {
  // Get filters from global context
  const { search, selectedDealers, selectedType, selectedStatus, dateRange } = useFilters()
  
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const scheduleIssues = useMemo(() => {
    return issues.filter(issue => scheduleIssueTypes.includes(issue.type))
  }, [])

  const filteredIssues = useMemo(() => {
    let result = [...scheduleIssues]

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

    if (selectedDealers.length > 0) {
      result = result.filter(issue => selectedDealers.includes(issue.agencyId))
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
        if (dateRange.to) {
          return issueDate >= dateRange.from! && issueDate <= dateRange.to
        }
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
        case 'minutesDiff':
          comparison = (a.minutesDiff || 0) - (b.minutesDiff || 0)
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [scheduleIssues, search, selectedDealers, selectedType, selectedStatus, dateRange, sortField, sortDirection])

  const totalPages = Math.ceil(filteredIssues.length / pageSize)
  const paginatedIssues = filteredIssues.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)

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

  const stats = useMemo(() => {
    const avgMinutes = filteredIssues.reduce((sum, i) => sum + (i.minutesDiff || 0), 0) / (filteredIssues.length || 1)
    
    return {
      total: filteredIssues.length,
      lateArrivals: filteredIssues.filter(i => i.type === 'late_arrival').length,
      earlyDepartures: filteredIssues.filter(i => i.type === 'early_departure').length,
      extendedLunch: filteredIssues.filter(i => i.type === 'extended_lunch').length,
      avgMinutes: Math.round(avgMinutes)
    }
  }, [filteredIssues])

  // Export data
  const exportData = filteredIssues.map(issue => {
    const employee = getEmployeeById(issue.employeeId)
    const agency = getAgencyById(issue.agencyId)
    return {
      'Employee': employee ? `${employee.firstName} ${employee.lastName}` : '',
      'Dealer': agency?.name || '',
      'Date': issue.date,
      'Violation Type': issueTypeLabels[issue.type],
      'Expected Time': issue.expectedTime || '',
      'Actual Time': issue.actualTime || '',
      'Difference (min)': issue.minutesDiff || '',
      'Status': issueStatusLabels[issue.status]
    }
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Clock className="h-7 w-7 text-[#FF9800]" />
            Schedule Violations
          </h1>
          <p className="text-muted-foreground mt-1">
            Late arrivals, early departures, and extended lunches
          </p>
        </div>
        <ExportButton data={exportData} filename="schedule-violations" title="Schedule Violations Report" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#FF9800]/10 border-[#FF9800]/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-[#FF9800]">Late Arrivals</p>
            <p className="text-2xl font-bold text-[#FF9800]">{stats.lateArrivals}</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-500/10 border-orange-500/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-orange-500">Early Departures</p>
            <p className="text-2xl font-bold text-orange-500">{stats.earlyDepartures}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-500/10 border-purple-500/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-purple-400">Extended Lunch</p>
            <p className="text-2xl font-bold text-purple-400">{stats.extendedLunch}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Avg. Minutes</p>
            <p className="text-2xl font-bold text-foreground">{stats.avgMinutes}m</p>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {paginatedIssues.length} of {filteredIssues.length} records
        </p>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPageIndex(0) }}>
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

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#1565C0] text-white">
                  <th className="px-4 py-3 text-left rounded-tl-md">
                    <button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('employee')}>
                      Employee <SortIcon field="employee" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('agency')}>
                      Dealer <SortIcon field="agency" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('date')}>
                      Date <SortIcon field="date" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium">Assigned Schedule</th>
                  <th className="px-4 py-3 text-left">
                    <button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('type')}>
                      Violation <SortIcon field="type" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium">Actual Time</th>
                  <th className="px-4 py-3 text-left">
                    <button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('minutesDiff')}>
                      Difference <SortIcon field="minutesDiff" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left rounded-tr-md">
                    <button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('status')}>
                      Status <SortIcon field="status" />
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
                        <EmployeeAvatar employee={employee} size="sm" showName showPosition />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{agency.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-foreground">{format(new Date(issue.date), 'MMM dd, yyyy')}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(issue.date), 'EEEE')}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground font-mono">{issue.expectedTime || '08:00-17:00'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <IssueTypeBadge type={issue.type} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground font-mono">{issue.actualTime || '-'}</span>
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
            <p className="text-sm text-muted-foreground">Page {pageIndex + 1} of {totalPages}</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex - 1)} disabled={pageIndex === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex + 1)} disabled={pageIndex >= totalPages - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setPageIndex(totalPages - 1)} disabled={pageIndex >= totalPages - 1}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
