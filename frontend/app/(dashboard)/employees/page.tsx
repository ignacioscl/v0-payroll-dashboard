'use client'

import { useState, useMemo } from 'react'
import { employees, agencies, getAgencyById, getIssuesByEmployee, getOvertimeByEmployee } from '@/lib/mock-data'
import { EmployeeAvatar } from '@/components/employees/employee-avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Users, Search, Eye, Clock, AlertTriangle, Timer, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { IssueTypeBadge, StatusBadge } from '@/components/shared/status-badge'
import { ExportButton } from '@/components/shared/export-button'
import { useTranslation } from '@/lib/i18n/locale-context'

type SortField = 'name' | 'agency' | 'position' | 'hireDate' | 'issues' | 'status'
type SortDirection = 'asc' | 'desc'

export default function EmployeesPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedAgency, setSelectedAgency] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pageIndex, setPageIndex] = useState(0)
  const [selectedEmployee, setSelectedEmployee] = useState<typeof employees[0] | null>(null)
  const pageSize = 25

  const enrichedEmployees = useMemo(() => {
    return employees.map(emp => {
      const issues = getIssuesByEmployee(emp.id)
      const overtime = getOvertimeByEmployee(emp.id)
      const totalOvertimeHours = overtime.reduce((sum, ot) => sum + ot.overtimeHours, 0)
      const agency = getAgencyById(emp.agencyId)
      return { ...emp, agency, issueCount: issues.length, overtimeHours: Math.round(totalOvertimeHours * 10) / 10, recentIssues: issues.slice(0, 5) }
    })
  }, [])

  const filteredEmployees = useMemo(() => {
    let result = [...enrichedEmployees]
    if (search) { const s = search.toLowerCase(); result = result.filter(emp => emp.firstName.toLowerCase().includes(s) || emp.lastName.toLowerCase().includes(s) || emp.id.toLowerCase().includes(s)) }
    if (selectedAgency !== 'all') result = result.filter(emp => emp.agencyId === selectedAgency)
    if (selectedStatus !== 'all') result = result.filter(emp => emp.status === selectedStatus)
    result.sort((a, b) => { let comparison = 0; switch (sortField) { case 'name': comparison = a.firstName.localeCompare(b.firstName); break; case 'agency': comparison = (a.agency?.name || '').localeCompare(b.agency?.name || ''); break; case 'position': comparison = a.position.localeCompare(b.position); break; case 'hireDate': comparison = new Date(a.hireDate).getTime() - new Date(b.hireDate).getTime(); break; case 'issues': comparison = a.issueCount - b.issueCount; break; case 'status': comparison = a.status.localeCompare(b.status); break }; return sortDirection === 'asc' ? comparison : -comparison })
    return result
  }, [enrichedEmployees, search, selectedAgency, selectedStatus, sortField, sortDirection])

  const totalPages = Math.ceil(filteredEmployees.length / pageSize)
  const paginatedEmployees = filteredEmployees.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)

  const handleSort = (field: SortField) => { if (sortField === field) { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortField(field); setSortDirection('asc') } }
  const SortIcon = ({ field }: { field: SortField }) => { if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />; return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" /> }

  const stats = useMemo(() => { const active = employees.filter(e => e.status === 'active').length; const inactive = employees.filter(e => e.status === 'inactive').length; const totalIssues = enrichedEmployees.reduce((sum, e) => sum + e.issueCount, 0); const avgIssues = Math.round(totalIssues / employees.length * 10) / 10; return { total: employees.length, active, inactive, avgIssues } }, [enrichedEmployees])

  const exportData = filteredEmployees.map(e => ({
    [t('mockEmployees.exportId')]: e.id,
    [t('mockEmployees.exportName')]: `${e.firstName} ${e.lastName}`,
    [t('dealer.label')]: e.agency?.name || '',
    [t('mockEmployees.exportPosition')]: e.position,
    [t('mockEmployees.exportHireDate')]: e.hireDate,
    [t('mockRanking.issues')]: e.issueCount,
    [t('mockEmployees.exportOvertimeHours')]: e.overtimeHours,
    [t('mockEmployees.exportStatus')]: e.status,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3"><Users className="h-7 w-7 text-[#2196F3]" />{t('mockEmployees.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('mockEmployees.subtitle')}</p>
        </div>
        <ExportButton data={exportData} filename="employee-directory" title={t('mockEmployees.exportTitle')} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">{t('mockEmployees.totalEmployees')}</p><p className="text-2xl font-bold text-foreground">{stats.total}</p></CardContent></Card>
        <Card className="bg-[#4CAF50]/10 border-[#4CAF50]/30"><CardContent className="pt-4 pb-4"><p className="text-xs text-[#4CAF50]">{t('mockEmployees.active')}</p><p className="text-2xl font-bold text-[#4CAF50]">{stats.active}</p></CardContent></Card>
        <Card className="bg-red-500/10 border-red-500/30"><CardContent className="pt-4 pb-4"><p className="text-xs text-red-500">{t('mockEmployees.inactive')}</p><p className="text-2xl font-bold text-red-500">{stats.inactive}</p></CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">{t('mockEmployees.avgIssues')}</p><p className="text-2xl font-bold text-foreground">{stats.avgIssues}</p></CardContent></Card>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t('mockEmployees.searchPlaceholder')} value={search} onChange={(e) => { setSearch(e.target.value); setPageIndex(0) }} className="pl-10 bg-background border-border" /></div>
            <Select value={selectedAgency} onValueChange={(v) => { setSelectedAgency(v); setPageIndex(0) }}><SelectTrigger className="w-[200px] border-border"><SelectValue placeholder={t('dealer.label')} /></SelectTrigger><SelectContent><SelectItem value="all">{t('dealer.all')}</SelectItem>{agencies.slice(0, 30).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPageIndex(0) }}><SelectTrigger className="w-[140px] border-border"><SelectValue placeholder={t('common.status')} /></SelectTrigger><SelectContent><SelectItem value="all">{t('common.all')}</SelectItem><SelectItem value="active">{t('mockEmployees.active')}</SelectItem><SelectItem value="inactive">{t('mockEmployees.inactive')}</SelectItem></SelectContent></Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{t('mockEmployees.showingEmployees', { shown: paginatedEmployees.length, total: filteredEmployees.length })}</p></div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-table-header text-white"><th className="px-4 py-3 text-left rounded-tl-md"><button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('name')}>{t('common.employee')} <SortIcon field="name" /></button></th><th className="px-4 py-3 text-left"><button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('agency')}>{t('dealer.label')} <SortIcon field="agency" /></button></th><th className="px-4 py-3 text-left"><button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('position')}>{t('mockEmployees.exportPosition')} <SortIcon field="position" /></button></th><th className="px-4 py-3 text-left"><button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('hireDate')}>{t('mockEmployees.hireDate')} <SortIcon field="hireDate" /></button></th><th className="px-4 py-3 text-left text-xs font-medium">{t('mockEmployees.schedule')}</th><th className="px-4 py-3 text-center"><button className="flex items-center justify-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('issues')}>{t('mockRanking.issues')} <SortIcon field="issues" /></button></th><th className="px-4 py-3 text-center"><button className="flex items-center justify-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('status')}>{t('common.status')} <SortIcon field="status" /></button></th><th className="px-4 py-3 text-center text-xs font-medium rounded-tr-md">{t('common.actions')}</th></tr></thead>
              <tbody className="divide-y divide-border">
                {paginatedEmployees.map((emp, index) => (
                  <tr key={emp.id} className={`hover:bg-muted/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}>
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar className="h-10 w-10"><AvatarImage src={emp.photo} alt={`${emp.firstName} ${emp.lastName}`} /><AvatarFallback className="bg-[#2196F3]/10 text-[#2196F3] text-xs">{emp.firstName[0]}{emp.lastName[0]}</AvatarFallback></Avatar><div><p className="text-sm font-medium text-foreground">{emp.firstName} {emp.lastName}</p><p className="text-xs text-muted-foreground">ID: {emp.id}</p></div></div></td>
                    <td className="px-4 py-3"><span className="text-sm text-foreground">{emp.agency?.name}</span></td>
                    <td className="px-4 py-3"><span className="text-sm text-foreground">{emp.position}</span></td>
                    <td className="px-4 py-3"><span className="text-sm text-foreground">{format(new Date(emp.hireDate), 'MMM dd, yyyy')}</span></td>
                    <td className="px-4 py-3"><span className="text-sm text-muted-foreground font-mono">{emp.schedule.monday?.entry} - {emp.schedule.monday?.exit}</span></td>
                    <td className="px-4 py-3 text-center"><span className={cn('text-sm font-medium', emp.issueCount === 0 ? 'text-[#4CAF50]' : emp.issueCount < 5 ? 'text-foreground' : 'text-red-500')}>{emp.issueCount}</span></td>
                    <td className="px-4 py-3 text-center">{emp.status === 'active' ? <Badge variant="outline" className="bg-[#4CAF50]/10 text-[#4CAF50] border-[#4CAF50]/30"><CheckCircle className="h-3 w-3 mr-1" />{t('mockEmployees.active')}</Badge> : <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />{t('mockEmployees.inactive')}</Badge>}</td>
                    <td className="px-4 py-3 text-center">
                      <Dialog><DialogTrigger asChild><Button variant="ghost" size="sm" onClick={() => setSelectedEmployee(emp)}><Eye className="h-4 w-4" /></Button></DialogTrigger>
                        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{t('mockEmployees.employeeDetails')}</DialogTitle></DialogHeader>
                          {emp && (
                            <div className="space-y-6">
                              <div className="flex items-start gap-4"><Avatar className="h-20 w-20"><AvatarImage src={emp.photo} /><AvatarFallback className="text-xl">{emp.firstName[0]}{emp.lastName[0]}</AvatarFallback></Avatar>
                                <div className="flex-1"><h3 className="text-xl font-bold text-foreground">{emp.firstName} {emp.lastName}</h3><p className="text-muted-foreground">{emp.position}</p><div className="mt-2 grid grid-cols-2 gap-2 text-sm"><div className="flex items-center gap-2"><span className="text-muted-foreground">ID:</span><span className="text-foreground">{emp.id}</span></div>                                <div className="flex items-center gap-2"><span className="text-muted-foreground">{t('dealer.label')}:</span><span className="text-foreground">{emp.agency?.name}</span></div><div className="flex items-center gap-2"><span className="text-muted-foreground">{t('mockEmployees.hireDate')}:</span><span className="text-foreground">{format(new Date(emp.hireDate), 'MMM dd, yyyy')}</span></div><div className="flex items-center gap-2"><span className="text-muted-foreground">{t('mockEmployees.rate')}:</span><span className="text-foreground">${emp.hourlyRate}/hr</span></div></div></div>
                              </div>
                              <div className="grid grid-cols-3 gap-4">
                                <Card className="bg-muted/50"><CardContent className="pt-4 pb-4 flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-[#FF9800]" /><div><p className="text-xs text-muted-foreground">{t('mockRanking.issues')}</p><p className="text-xl font-bold text-foreground">{emp.issueCount}</p></div></CardContent></Card>
                                <Card className="bg-muted/50"><CardContent className="pt-4 pb-4 flex items-center gap-3"><Timer className="h-8 w-8 text-[#2196F3]" /><div><p className="text-xs text-muted-foreground">{t('mockRanking.overtime')}</p><p className="text-xl font-bold text-foreground">{emp.overtimeHours}h</p></div></CardContent></Card>
                                <Card className="bg-muted/50"><CardContent className="pt-4 pb-4 flex items-center gap-3"><Clock className="h-8 w-8 text-[#2196F3]" /><div><p className="text-xs text-muted-foreground">{t('mockEmployees.schedule')}</p><p className="text-sm font-bold text-foreground">{emp.schedule.monday?.entry} - {emp.schedule.monday?.exit}</p></div></CardContent></Card>
                              </div>
                              <div><h4 className="text-sm font-medium text-foreground mb-3">{t('mockEmployees.recentIssues')}</h4>{emp.recentIssues.length > 0 ? <div className="space-y-2">{emp.recentIssues.map(issue => (<div key={issue.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50"><div><p className="text-sm text-foreground">{format(new Date(issue.date), 'MMM dd, yyyy')}</p></div><div className="flex items-center gap-2"><IssueTypeBadge type={issue.type} /><StatusBadge status={issue.status} /></div></div>))}</div> : <p className="text-sm text-muted-foreground text-center py-4">{t('mockEmployees.noRecentIssues')}</p>}</div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3"><p className="text-sm text-muted-foreground">{t('common.pageOf', { page: pageIndex + 1, total: totalPages })}</p><div className="flex items-center gap-1"><Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex - 1)} disabled={pageIndex === 0}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex + 1)} disabled={pageIndex >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button></div></div>
        </CardContent>
      </Card>
    </div>
  )
}
