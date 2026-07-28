'use client'

import { useState, useMemo } from 'react'
import { getAgencyStats, agencies, employees } from '@/lib/mock-data'
import { useTranslation } from '@/lib/i18n/locale-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DollarSign, Search, Building2, Users, TrendingUp, Clock, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { cn } from '@/lib/utils'
import { ExportButton } from '@/components/shared/export-button'

type SortField = 'name' | 'employees' | 'issues' | 'overtime' | 'cost' | 'punctuality'
type SortDirection = 'asc' | 'desc'

export default function CostsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('cost')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 20

  const agencyStats = getAgencyStats()

  const globalStats = useMemo(() => {
    const totalEmployees = employees.filter(e => e.status === 'active').length
    const totalOvertimeHours = agencyStats.reduce((sum, a) => sum + a.totalOvertimeHours, 0)
    const totalCost = agencyStats.reduce((sum, a) => sum + a.estimatedCost, 0)
    const avgPunctuality = Math.round(agencyStats.reduce((sum, a) => sum + a.punctualityRate, 0) / agencyStats.length)
    const regularCost = totalEmployees * 8 * 12 * 22
    return { totalEmployees, totalOvertimeHours: Math.round(totalOvertimeHours), totalOvertimeCost: Math.round(totalCost), avgPunctuality, regularCost, totalPayroll: regularCost + Math.round(totalCost) }
  }, [agencyStats])

  const filteredStats = useMemo(() => {
    let result = [...agencyStats]
    if (search) result = result.filter(s => s.agencyName.toLowerCase().includes(search.toLowerCase()))
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name': comparison = a.agencyName.localeCompare(b.agencyName); break
        case 'employees': comparison = a.totalEmployees - b.totalEmployees; break
        case 'issues': comparison = a.totalIssues - b.totalIssues; break
        case 'overtime': comparison = a.totalOvertimeHours - b.totalOvertimeHours; break
        case 'cost': comparison = a.estimatedCost - b.estimatedCost; break
        case 'punctuality': comparison = a.punctualityRate - b.punctualityRate; break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return result
  }, [agencyStats, search, sortField, sortDirection])

  const totalPages = Math.ceil(filteredStats.length / pageSize)
  const paginatedStats = filteredStats.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)

  const handleSort = (field: SortField) => { if (sortField === field) { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortField(field); setSortDirection('desc') } }
  const SortIcon = ({ field }: { field: SortField }) => { if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />; return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" /> }

  const topAgenciesByCost = filteredStats.sort((a, b) => b.estimatedCost - a.estimatedCost).slice(0, 10).map(a => ({ name: a.agencyName.split(' ').slice(0, 2).join(' '), cost: Math.round(a.estimatedCost), hours: Math.round(a.totalOvertimeHours) }))
  const costDistribution = useMemo(() => [
    { name: t('mockCosts.regularHours'), value: globalStats.regularCost, color: '#4CAF50' },
    { name: t('mockCosts.overtime'), value: globalStats.totalOvertimeCost, color: '#FF9800' },
  ], [t, globalStats.regularCost, globalStats.totalOvertimeCost])

  const exportData = filteredStats.map(s => ({
    [t('dealer.label')]: s.agencyName,
    [t('mockCosts.exportEmployees')]: s.totalEmployees,
    [t('mockCosts.tableIssues')]: s.totalIssues,
    [t('mockCosts.exportOvertimeHours')]: s.totalOvertimeHours,
    [t('mockCosts.exportOvertimeCost')]: s.estimatedCost,
    [t('mockCosts.exportPunctuality')]: s.punctualityRate
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3"><DollarSign className="h-7 w-7 text-[#4CAF50]" />{t('mockCosts.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('mockCosts.subtitle')}</p>
        </div>
        <ExportButton data={exportData} filename="costs-by-dealer" title={t('mockCosts.exportTitle')} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{t('mockCosts.activeEmployees')}</p><p className="text-2xl font-bold text-foreground">{globalStats.totalEmployees}</p></div><Users className="h-6 w-6 text-muted-foreground/50" /></div></CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{t('mockCosts.totalDealers')}</p><p className="text-2xl font-bold text-foreground">{agencies.length}</p></div><Building2 className="h-6 w-6 text-muted-foreground/50" /></div></CardContent></Card>
        <Card className="bg-[#2196F3]/10 border-[#2196F3]/30"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[#2196F3]">{t('mockCosts.totalOvertime')}</p><p className="text-2xl font-bold text-[#2196F3]">{globalStats.totalOvertimeHours}h</p></div><Clock className="h-6 w-6 text-[#2196F3]/50" /></div></CardContent></Card>
        <Card className="bg-[#FF9800]/10 border-[#FF9800]/30"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[#FF9800]">{t('mockCosts.overtimeCost')}</p><p className="text-2xl font-bold text-[#FF9800]">${globalStats.totalOvertimeCost.toLocaleString()}</p></div><DollarSign className="h-6 w-6 text-[#FF9800]/50" /></div></CardContent></Card>
        <Card className="bg-[#4CAF50]/10 border-[#4CAF50]/30"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[#4CAF50]">{t('mockCosts.estPayroll')}</p><p className="text-2xl font-bold text-[#4CAF50]">${globalStats.totalPayroll.toLocaleString()}</p></div><TrendingUp className="h-6 w-6 text-[#4CAF50]/50" /></div></CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{t('mockCosts.avgPunctuality')}</p><p className="text-2xl font-bold text-foreground">{globalStats.avgPunctuality}%</p></div><TrendingUp className="h-6 w-6 text-muted-foreground/50" /></div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockCosts.top10ByOtCost')}</CardTitle></CardHeader>
          <CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={topAgenciesByCost} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" stroke="#64748b" fontSize={12} tickFormatter={(v) => `$${v}`} /><YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} width={100} /><Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }} formatter={(value, name) => [name === 'cost' ? `$${value}` : `${value}h`, name === 'cost' ? t('mockCosts.costTooltip') : t('mockCosts.hoursTooltip')]} /><Bar dataKey="cost" name="cost" fill="#FF9800" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockCosts.payrollDistribution')}</CardTitle></CardHeader>
          <CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={costDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>{costDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }} formatter={(value) => [`$${Number(value).toLocaleString()}`, '']} /><Legend /></PieChart></ResponsiveContainer></div></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t('mockCosts.searchDealer')} value={search} onChange={(e) => { setSearch(e.target.value); setPageIndex(0) }} className="pl-10 bg-background border-border" /></div>
        <p className="text-sm text-muted-foreground">{t('mockCosts.dealerCount', { count: filteredStats.length })}</p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-table-header text-white"><th className="px-4 py-3 text-left rounded-tl-md"><button className="flex items-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('name')}>{t('dealer.label')} <SortIcon field="name" /></button></th><th className="px-4 py-3 text-center"><button className="flex items-center justify-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('employees')}>{t('mockCosts.tableEmployees')} <SortIcon field="employees" /></button></th><th className="px-4 py-3 text-center"><button className="flex items-center justify-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('issues')}>{t('mockCosts.tableIssues')} <SortIcon field="issues" /></button></th><th className="px-4 py-3 text-center"><button className="flex items-center justify-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('overtime')}>{t('mockCosts.tableOvertime')} <SortIcon field="overtime" /></button></th><th className="px-4 py-3 text-center"><button className="flex items-center justify-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('cost')}>{t('mockCosts.otCost')} <SortIcon field="cost" /></button></th><th className="px-4 py-3 text-center"><button className="flex items-center justify-center text-xs font-medium hover:text-white/80" onClick={() => handleSort('punctuality')}>{t('mockCosts.punctuality')} <SortIcon field="punctuality" /></button></th><th className="px-4 py-3 text-right text-xs font-medium rounded-tr-md">{t('mockCosts.costPerEmployee')}</th></tr></thead>
              <tbody className="divide-y divide-border">
                {paginatedStats.map((stat, index) => {
                  const costPerEmployee = stat.totalEmployees > 0 ? Math.round(stat.estimatedCost / stat.totalEmployees) : 0
                  return (
                    <tr key={stat.agencyId} className={`hover:bg-muted/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}>
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2196F3]/10"><Building2 className="h-5 w-5 text-[#2196F3]" /></div><span className="text-sm font-medium text-foreground">{stat.agencyName}</span></div></td>
                      <td className="px-4 py-3 text-center"><span className="text-sm text-foreground">{stat.totalEmployees}</span></td>
                      <td className="px-4 py-3 text-center"><span className={cn('text-sm font-medium', stat.totalIssues > 20 ? 'text-red-500' : stat.totalIssues > 10 ? 'text-[#FF9800]' : 'text-foreground')}>{stat.totalIssues}</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-sm text-[#2196F3] font-medium">{stat.totalOvertimeHours}h</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-sm text-[#FF9800] font-medium">${Math.round(stat.estimatedCost).toLocaleString()}</span></td>
                      <td className="px-4 py-3 text-center"><span className={cn('text-sm font-medium', stat.punctualityRate >= 80 ? 'text-[#4CAF50]' : stat.punctualityRate >= 60 ? 'text-[#FF9800]' : 'text-red-500')}>{stat.punctualityRate}%</span></td>
                      <td className="px-4 py-3 text-right"><span className="text-sm text-muted-foreground">${costPerEmployee.toLocaleString()}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">{t('mockCosts.showingOf', { shown: paginatedStats.length, total: filteredStats.length })}</p>
            <div className="flex items-center gap-1"><Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex - 1)} disabled={pageIndex === 0}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground px-2">{pageIndex + 1} / {totalPages}</span><Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex + 1)} disabled={pageIndex >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
