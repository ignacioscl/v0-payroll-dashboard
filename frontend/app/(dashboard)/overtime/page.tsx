'use client'

import { useState, useMemo } from 'react'
import { 
  overtimeRecords, 
  getEmployeeById, 
  getAgencyById,
  agencies
} from '@/lib/mock-data'
import { useTranslation } from '@/lib/i18n/locale-context'
import { EmployeeAvatar } from '@/components/employees/employee-avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Timer,
  Search,
  DollarSign,
  Users,
  Building2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { format } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts'
import { ExportButton } from '@/components/shared/export-button'

export default function OvertimePage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedAgency, setSelectedAgency] = useState<string>('all')
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 20

  const employeeOvertime = useMemo(() => {
    const grouped = new Map<string, { 
      employeeId: string, 
      totalHours: number, 
      totalCost: number,
      records: typeof overtimeRecords
    }>()

    overtimeRecords.forEach(record => {
      const existing = grouped.get(record.employeeId)
      if (existing) {
        existing.totalHours += record.overtimeHours
        existing.totalCost += record.overtimeCost
        existing.records.push(record)
      } else {
        grouped.set(record.employeeId, {
          employeeId: record.employeeId,
          totalHours: record.overtimeHours,
          totalCost: record.overtimeCost,
          records: [record]
        })
      }
    })

    return Array.from(grouped.values())
      .map(item => ({
        ...item,
        employee: getEmployeeById(item.employeeId),
        agency: getAgencyById(getEmployeeById(item.employeeId)?.agencyId || '')
      }))
      .filter(item => item.employee && item.agency)
      .sort((a, b) => b.totalHours - a.totalHours)
  }, [])

  const agencyOvertime = useMemo(() => {
    const grouped = new Map<string, { 
      agencyId: string, 
      totalHours: number, 
      totalCost: number,
      employeeCount: number
    }>()

    overtimeRecords.forEach(record => {
      const existing = grouped.get(record.agencyId)
      if (existing) {
        existing.totalHours += record.overtimeHours
        existing.totalCost += record.overtimeCost
      } else {
        grouped.set(record.agencyId, {
          agencyId: record.agencyId,
          totalHours: record.overtimeHours,
          totalCost: record.overtimeCost,
          employeeCount: 0
        })
      }
    })

    const employeesByAgency = new Map<string, Set<string>>()
    overtimeRecords.forEach(record => {
      if (!employeesByAgency.has(record.agencyId)) {
        employeesByAgency.set(record.agencyId, new Set())
      }
      employeesByAgency.get(record.agencyId)!.add(record.employeeId)
    })

    return Array.from(grouped.values())
      .map(item => ({
        ...item,
        agency: getAgencyById(item.agencyId),
        employeeCount: employeesByAgency.get(item.agencyId)?.size || 0
      }))
      .filter(item => item.agency)
      .sort((a, b) => b.totalHours - a.totalHours)
  }, [])

  const filteredEmployees = useMemo(() => {
    let result = [...employeeOvertime]

    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(item => 
        item.employee?.firstName.toLowerCase().includes(searchLower) ||
        item.employee?.lastName.toLowerCase().includes(searchLower)
      )
    }

    if (selectedAgency !== 'all') {
      result = result.filter(item => item.employee?.agencyId === selectedAgency)
    }

    return result
  }, [employeeOvertime, search, selectedAgency])

  const filteredAgencies = useMemo(() => {
    if (selectedAgency !== 'all') {
      return agencyOvertime.filter(item => item.agencyId === selectedAgency)
    }
    return agencyOvertime
  }, [agencyOvertime, selectedAgency])

  const stats = useMemo(() => {
    const totalHours = overtimeRecords.reduce((sum, r) => sum + r.overtimeHours, 0)
    const totalCost = overtimeRecords.reduce((sum, r) => sum + r.overtimeCost, 0)
    const uniqueEmployees = new Set(overtimeRecords.map(r => r.employeeId)).size

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      totalCost: Math.round(totalCost * 100) / 100,
      uniqueEmployees
    }
  }, [])

  const topEmployeesChart = employeeOvertime.slice(0, 10).map(item => ({
    name: `${item.employee?.firstName} ${item.employee?.lastName.split(' ')[0]}`,
    hours: Math.round(item.totalHours * 10) / 10
  }))

  const trendData = useMemo(() => {
    const today = new Date()
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today)
      date.setDate(date.getDate() - (6 - i))
      return date.toISOString().split('T')[0]
    })

    return last7Days.map(dateStr => {
      const dayRecords = overtimeRecords.filter(r => r.date === dateStr)
      const totalHours = dayRecords.reduce((sum, r) => sum + r.overtimeHours, 0)
      return {
        date: format(new Date(dateStr), 'EEE'),
        hours: Math.round(totalHours * 10) / 10
      }
    })
  }, [])

  const totalPagesEmployees = Math.ceil(filteredEmployees.length / pageSize)
  const paginatedEmployees = filteredEmployees.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)

  const exportData = filteredEmployees.map(item => ({
    [t('common.employee')]: item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : '',
    [t('dealer.label')]: item.agency?.name || '',
    [t('mockOvertime.exportTotalHours')]: Math.round(item.totalHours * 10) / 10,
    [t('mockOvertime.exportTotalCost')]: Math.round(item.totalCost * 100) / 100,
    [t('mockOvertime.exportDaysWithOt')]: item.records.length,
    [t('mockOvertime.exportAvgHoursDay')]: Math.round((item.totalHours / item.records.length) * 10) / 10
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Timer className="h-7 w-7 text-[#2196F3]" />
            {t('mockOvertime.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('mockOvertime.subtitle')}
          </p>
        </div>
        <ExportButton data={exportData} filename="overtime-report" title={t('mockOvertime.exportTitle')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#2196F3]/10 border-[#2196F3]/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#2196F3]">{t('mockOvertime.totalHours')}</p>
                <p className="text-2xl font-bold text-[#2196F3]">{stats.totalHours}h</p>
              </div>
              <Timer className="h-8 w-8 text-[#2196F3]/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#4CAF50]/10 border-[#4CAF50]/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#4CAF50]">{t('mockOvertime.totalCost')}</p>
                <p className="text-2xl font-bold text-[#4CAF50]">${stats.totalCost.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-[#4CAF50]/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('mockOvertime.employeesWithOt')}</p>
                <p className="text-2xl font-bold text-foreground">{stats.uniqueEmployees}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-foreground">
              {t('mockOvertime.top10Employees')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topEmployeesChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} width={100} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }}
                    formatter={(value) => [`${value}h`, t('mockOvertime.hoursTooltip')]}
                  />
                  <Bar dataKey="hours" fill="#2196F3" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-foreground">
              {t('mockOvertime.dailyTrendLast7')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }}
                    formatter={(value) => [`${value}h`, t('mockOvertime.hoursTooltip')]}
                  />
                  <Line type="monotone" dataKey="hours" stroke="#2196F3" strokeWidth={2} dot={{ fill: '#2196F3' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="employees" onValueChange={() => setPageIndex(0)}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <TabsList>
            <TabsTrigger value="employees" className="gap-2">
              <Users className="h-4 w-4" />
              {t('mockOvertime.byEmployee')}
            </TabsTrigger>
            <TabsTrigger value="agencies" className="gap-2">
              <Building2 className="h-4 w-4" />
              {t('mockOvertime.byDealer')}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('common.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-background border-border"
              />
            </div>
            <Select value={selectedAgency} onValueChange={setSelectedAgency}>
              <SelectTrigger className="w-[180px] border-border">
                <SelectValue placeholder={t('dealer.label')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dealer.all')}</SelectItem>
                {agencies.slice(0, 20).map(agency => (
                  <SelectItem key={agency.id} value={agency.id}>{agency.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="employees" className="mt-4">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#1565C0] text-white">
                    <th className="px-4 py-3 text-left text-xs font-medium rounded-tl-md">{t('common.employee')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium">{t('dealer.label')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium">{t('mockOvertime.tableTotalHours')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium">{t('mockOvertime.tableTotalCost')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium">{t('mockOvertime.tableDaysWithOt')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium rounded-tr-md">{t('mockOvertime.tableAvgDay')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedEmployees.map((item, index) => (
                    <tr key={item.employeeId} className={`hover:bg-muted/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}>
                      <td className="px-4 py-3">
                        <EmployeeAvatar employee={item.employee!} size="sm" showName showPosition />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{item.agency?.name}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-[#2196F3]">{Math.round(item.totalHours * 10) / 10}h</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-[#4CAF50]">${Math.round(item.totalCost).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-foreground">{item.records.length}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-muted-foreground">
                          {Math.round((item.totalHours / item.records.length) * 10) / 10}h
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {t('mockOvertime.showingOf', { shown: paginatedEmployees.length, total: filteredEmployees.length })}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex - 1)} disabled={pageIndex === 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    {pageIndex + 1} / {totalPagesEmployees}
                  </span>
                  <Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex + 1)} disabled={pageIndex >= totalPagesEmployees - 1}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agencies" className="mt-4">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#1565C0] text-white">
                    <th className="px-4 py-3 text-left text-xs font-medium rounded-tl-md">{t('dealer.label')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium">{t('mockOvertime.tableEmployeesWithOt')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium">{t('mockOvertime.tableTotalHours')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium">{t('mockOvertime.tableTotalCost')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium rounded-tr-md">{t('mockOvertime.tableAvgEmployee')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAgencies.map((item, index) => (
                    <tr key={item.agencyId} className={`hover:bg-muted/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2196F3]/10">
                            <Building2 className="h-5 w-5 text-[#2196F3]" />
                          </div>
                          <span className="text-sm font-medium text-foreground">{item.agency?.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-foreground">{item.employeeCount}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-[#2196F3]">{Math.round(item.totalHours * 10) / 10}h</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-[#4CAF50]">${Math.round(item.totalCost).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-muted-foreground">
                          {Math.round((item.totalHours / item.employeeCount) * 10) / 10}h
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
