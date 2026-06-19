'use client'

import { useState, useMemo } from 'react'
import { agencies, getEmployeesByAgency, getIssuesByAgency, getOvertimeByAgency } from '@/lib/mock-data'
import { EmployeeAvatar } from '@/components/employees/employee-avatar'
import { IssueTypeBadge, StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Building2, Search, Users, AlertTriangle, Timer, Phone, MapPin, User, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ExportButton } from '@/components/shared/export-button'
import { useTranslation } from '@/lib/i18n/locale-context'

export default function DealersPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 12

  const enrichedAgencies = useMemo(() => {
    return agencies.map(agency => {
      const agencyEmployees = getEmployeesByAgency(agency.id)
      const agencyIssues = getIssuesByAgency(agency.id)
      const agencyOvertime = getOvertimeByAgency(agency.id)
      const totalOvertimeHours = agencyOvertime.reduce((sum, ot) => sum + ot.overtimeHours, 0)
      const totalOvertimeCost = agencyOvertime.reduce((sum, ot) => sum + ot.overtimeCost, 0)
      const uniqueDates = new Set(agencyIssues.map(i => i.date)).size
      const punctualityRate = Math.max(0, Math.round((1 - uniqueDates / 30) * 100))
      return { ...agency, employees: agencyEmployees, employeeCount: agencyEmployees.length, issueCount: agencyIssues.length, recentIssues: agencyIssues.slice(0, 5), overtimeHours: Math.round(totalOvertimeHours * 10) / 10, overtimeCost: Math.round(totalOvertimeCost), punctualityRate }
    })
  }, [])

  const filteredAgencies = useMemo(() => { if (!search) return enrichedAgencies; return enrichedAgencies.filter(a => a.name.toLowerCase().includes(search.toLowerCase())) }, [enrichedAgencies, search])

  const totalPages = Math.ceil(filteredAgencies.length / pageSize)
  const paginatedAgencies = filteredAgencies.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  const selectedAgencyData = selectedAgency ? enrichedAgencies.find(a => a.id === selectedAgency) : null

  const globalStats = useMemo(() => ({ totalAgencies: agencies.length, totalEmployees: enrichedAgencies.reduce((sum, a) => sum + a.employeeCount, 0), totalIssues: enrichedAgencies.reduce((sum, a) => sum + a.issueCount, 0), avgPunctuality: Math.round(enrichedAgencies.reduce((sum, a) => sum + a.punctualityRate, 0) / enrichedAgencies.length) }), [enrichedAgencies])

  const topAgenciesData = enrichedAgencies.sort((a, b) => b.issueCount - a.issueCount).slice(0, 8).map(a => ({ name: a.name.split(' ').slice(0, 2).join(' '), issues: a.issueCount, employees: a.employeeCount }))

  const exportData = enrichedAgencies.map(a => ({
    [t('dealer.label')]: a.name,
    [t('mockDealers.exportEmployees')]: a.employeeCount,
    [t('mockRanking.issues')]: a.issueCount,
    [t('mockDealers.exportOvertimeHours')]: a.overtimeHours,
    [t('mockDealers.exportOvertimeCost')]: a.overtimeCost,
    [t('mockDealers.exportPunctuality')]: a.punctualityRate,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3"><Building2 className="h-7 w-7 text-[#2196F3]" />{t('mockDealers.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('mockDealers.subtitle')}</p>
        </div>
        <ExportButton data={exportData} filename="dealers-report" title={t('mockDealers.exportTitle')} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{t('mockDealers.totalDealers')}</p><p className="text-2xl font-bold text-foreground">{globalStats.totalAgencies}</p></div><Building2 className="h-8 w-8 text-muted-foreground/50" /></div></CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{t('mockDealers.totalEmployees')}</p><p className="text-2xl font-bold text-foreground">{globalStats.totalEmployees}</p></div><Users className="h-8 w-8 text-muted-foreground/50" /></div></CardContent></Card>
        <Card className="bg-[#FF9800]/10 border-[#FF9800]/30"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[#FF9800]">{t('mockDealers.totalIssues')}</p><p className="text-2xl font-bold text-[#FF9800]">{globalStats.totalIssues}</p></div><AlertTriangle className="h-8 w-8 text-[#FF9800]/50" /></div></CardContent></Card>
        <Card className="bg-[#4CAF50]/10 border-[#4CAF50]/30"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[#4CAF50]">{t('mockDealers.avgPunctuality')}</p><p className="text-2xl font-bold text-[#4CAF50]">{globalStats.avgPunctuality}%</p></div><TrendingUp className="h-8 w-8 text-[#4CAF50]/50" /></div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t('mockDealers.searchPlaceholder')} value={search} onChange={(e) => { setSearch(e.target.value); setPageIndex(0) }} className="pl-10 bg-background border-border" /></div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
            {paginatedAgencies.map(agency => (
              <Card key={agency.id} className={cn('cursor-pointer transition-all hover:border-[#2196F3]/50', selectedAgency === agency.id ? 'border-[#2196F3] bg-[#2196F3]/5' : 'bg-card border-border')} onClick={() => setSelectedAgency(agency.id)}>
                <CardContent className="pt-4 pb-4"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2196F3]/10"><Building2 className="h-5 w-5 text-[#2196F3]" /></div><div><p className="text-sm font-medium text-foreground">{agency.name}</p><p className="text-xs text-muted-foreground">{t('mockDealers.employeesCount', { count: agency.employeeCount })}</p></div></div><div className="text-right"><p className={cn('text-lg font-bold', agency.issueCount > 20 ? 'text-red-500' : agency.issueCount > 10 ? 'text-[#FF9800]' : 'text-foreground')}>{agency.issueCount}</p><p className="text-xs text-muted-foreground">{t('mockDealers.issuesLabel')}</p></div></div></CardContent>
              </Card>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2"><p className="text-xs text-muted-foreground">{t('mockDealers.dealersCount', { count: filteredAgencies.length })}</p><div className="flex items-center gap-1"><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(pageIndex - 1)} disabled={pageIndex === 0}><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs text-muted-foreground px-2">{pageIndex + 1}/{totalPages}</span><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(pageIndex + 1)} disabled={pageIndex >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button></div></div>
        </div>

        <div className="lg:col-span-2">
          {selectedAgencyData ? (
            <div className="space-y-4">
              <Card className="bg-card border-border"><CardContent className="pt-6"><div className="flex items-start gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#2196F3]/10"><Building2 className="h-8 w-8 text-[#2196F3]" /></div><div className="flex-1"><h2 className="text-2xl font-bold text-foreground">{selectedAgencyData.name}</h2><div className="mt-2 grid grid-cols-2 gap-4 text-sm"><div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{selectedAgencyData.address}</div><div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{selectedAgencyData.phone}</div><div className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" />{selectedAgencyData.contactPerson}</div></div></div></div></CardContent></Card>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-card border-border"><CardContent className="pt-4 pb-4 flex items-center gap-3"><Users className="h-8 w-8 text-[#2196F3]" /><div><p className="text-xs text-muted-foreground">{t('mockDealers.exportEmployees')}</p><p className="text-xl font-bold text-foreground">{selectedAgencyData.employeeCount}</p></div></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="pt-4 pb-4 flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-[#FF9800]" /><div><p className="text-xs text-muted-foreground">{t('mockRanking.issues')}</p><p className="text-xl font-bold text-foreground">{selectedAgencyData.issueCount}</p></div></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="pt-4 pb-4 flex items-center gap-3"><Timer className="h-8 w-8 text-[#2196F3]" /><div><p className="text-xs text-muted-foreground">{t('mockRanking.overtime')}</p><p className="text-xl font-bold text-foreground">{selectedAgencyData.overtimeHours}h</p></div></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="pt-4 pb-4 flex items-center gap-3"><TrendingUp className="h-8 w-8 text-[#4CAF50]" /><div><p className="text-xs text-muted-foreground">{t('mockCosts.punctuality')}</p><p className="text-xl font-bold text-foreground">{selectedAgencyData.punctualityRate}%</p></div></CardContent></Card>
              </div>
              <Card className="bg-card border-border"><CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockDealers.assignedEmployees')}</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{selectedAgencyData.employees.slice(0, 9).map(emp => (<div key={emp.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"><EmployeeAvatar employee={emp} size="sm" /><div className="overflow-hidden"><p className="text-sm font-medium text-foreground truncate">{emp.firstName} {emp.lastName.split(' ')[0]}</p><p className="text-xs text-muted-foreground">{emp.position}</p></div></div>))}{selectedAgencyData.employees.length > 9 && <div className="flex items-center justify-center p-2 rounded-lg bg-muted/50"><p className="text-sm text-muted-foreground">{t('mockDealers.moreEmployees', { count: selectedAgencyData.employees.length - 9 })}</p></div>}</div></CardContent></Card>
              <Card className="bg-card border-border"><CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockDealers.recentIssues')}</CardTitle></CardHeader><CardContent>{selectedAgencyData.recentIssues.length > 0 ? <div className="space-y-2">{selectedAgencyData.recentIssues.map(issue => { const emp = selectedAgencyData.employees.find(e => e.id === issue.employeeId); return (<div key={issue.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50"><div className="flex items-center gap-3">{emp && <EmployeeAvatar employee={emp} size="sm" />}<div><p className="text-sm font-medium text-foreground">{emp?.firstName} {emp?.lastName.split(' ')[0]}</p><p className="text-xs text-muted-foreground">{format(new Date(issue.date), 'MMM dd, yyyy')}</p></div></div><div className="flex items-center gap-2"><IssueTypeBadge type={issue.type} /><StatusBadge status={issue.status} /></div></div>)})}</div> : <p className="text-sm text-muted-foreground text-center py-4">{t('mockDealers.noRecentIssues')}</p>}</CardContent></Card>
            </div>
          ) : (
            <Card className="bg-card border-border h-full"><CardContent className="flex flex-col items-center justify-center h-96"><Building2 className="h-16 w-16 text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">{t('mockDealers.selectDealer')}</p></CardContent></Card>
          )}
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockDealers.comparisonChart')}</CardTitle></CardHeader>
        <CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={topAgenciesData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" stroke="#64748b" fontSize={10} angle={-15} textAnchor="end" height={60} /><YAxis stroke="#64748b" fontSize={12} /><Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }} /><Bar dataKey="issues" name={t('mockDealers.chartIssues')} fill="#FF9800" radius={[4, 4, 0, 0]} /><Bar dataKey="employees" name={t('mockDealers.chartEmployees')} fill="#2196F3" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent>
      </Card>
    </div>
  )
}
