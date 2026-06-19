'use client'

import { useMemo, useState } from 'react'
import { issues, agencies, getIssuesByAgency } from '@/lib/mock-data'
import type { IssueType } from '@/lib/types'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getIssueTypeLabels } from '@/lib/i18n/label-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TrendingUp } from 'lucide-react'
import { format, subDays, eachDayOfInterval, getDay } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area, Legend, PieChart, Pie, Cell } from 'recharts'
import { ExportButton } from '@/components/shared/export-button'

const COLORS = ['#ef4444', '#FF9800', '#2196F3', '#9C27B0', '#E91E63', '#00ACC1', '#4CAF50', '#673AB7']

export default function TrendsPage() {
  const { t } = useTranslation()
  const issueTypeLabels = useMemo(() => getIssueTypeLabels(t), [t])

  const weekdayLabels = useMemo(() => [
    t('mockTrends.weekdayMon'),
    t('mockTrends.weekdayTue'),
    t('mockTrends.weekdayWed'),
    t('mockTrends.weekdayThu'),
    t('mockTrends.weekdayFri'),
    t('mockTrends.weekdaySat'),
  ], [t])

  const [period, setPeriod] = useState<'7' | '14' | '30'>('30')
  const [selectedAgency, setSelectedAgency] = useState<string>('all')
  const today = new Date()
  const periodDays = parseInt(period)

  const trendData = useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(today, periodDays - 1), end: today })
    return days.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd')
      let dayIssues = issues.filter(i => i.date === dateStr)
      if (selectedAgency !== 'all') dayIssues = dayIssues.filter(i => i.agencyId === selectedAgency)
      return {
        date: dateStr, displayDate: format(date, 'MM/dd'),
        totalIssues: dayIssues.length,
        lateArrivals: dayIssues.filter(i => i.type === 'late_arrival').length,
        missingPunches: dayIssues.filter(i => i.type.startsWith('missing') || i.type === 'no_punches').length
      }
    })
  }, [periodDays, selectedAgency])

  const issueDistribution = useMemo(() => {
    let filteredIssues = issues.filter(i => new Date(i.date) >= subDays(today, periodDays))
    if (selectedAgency !== 'all') filteredIssues = filteredIssues.filter(i => i.agencyId === selectedAgency)
    const distribution = {} as Record<IssueType, number>
    filteredIssues.forEach(issue => { distribution[issue.type] = (distribution[issue.type] || 0) + 1 })
    return Object.entries(distribution).map(([type, count]) => ({ type: type as IssueType, name: issueTypeLabels[type as IssueType], count, percentage: Math.round((count / (filteredIssues.length || 1)) * 100) })).filter(d => d.count > 0).sort((a, b) => b.count - a.count)
  }, [periodDays, selectedAgency, issueTypeLabels])

  const heatmapData = useMemo(() => {
    let filteredIssues = issues.filter(i => new Date(i.date) >= subDays(today, periodDays))
    if (selectedAgency !== 'all') filteredIssues = filteredIssues.filter(i => i.agencyId === selectedAgency)
    return weekdayLabels.map((day, index) => {
      const dayIssues = filteredIssues.filter(i => { const dayOfWeek = (getDay(new Date(i.date)) + 6) % 7; return dayOfWeek === index })
      return { day, lateArrivals: dayIssues.filter(i => i.type === 'late_arrival').length, missing: dayIssues.filter(i => i.type.startsWith('missing')).length }
    })
  }, [periodDays, selectedAgency, weekdayLabels])

  const topAgencies = useMemo(() => {
    return agencies.map(agency => {
      const agencyIssues = getIssuesByAgency(agency.id).filter(i => new Date(i.date) >= subDays(today, periodDays))
      return { agency, issueCount: agencyIssues.length }
    }).sort((a, b) => b.issueCount - a.issueCount).slice(0, 10)
  }, [periodDays])

  const comparison = useMemo(() => {
    const currentStart = subDays(today, periodDays - 1)
    const previousStart = subDays(currentStart, periodDays)
    let currentIssues = issues.filter(i => { const d = new Date(i.date); return d >= currentStart && d <= today })
    let previousIssues = issues.filter(i => { const d = new Date(i.date); return d >= previousStart && d < currentStart })
    if (selectedAgency !== 'all') { currentIssues = currentIssues.filter(i => i.agencyId === selectedAgency); previousIssues = previousIssues.filter(i => i.agencyId === selectedAgency) }
    const change = previousIssues.length > 0 ? Math.round(((currentIssues.length - previousIssues.length) / previousIssues.length) * 100) : 0
    return { currentCount: currentIssues.length, change }
  }, [periodDays, selectedAgency])

  const stats = useMemo(() => {
    const avgDaily = Math.round(trendData.reduce((sum, d) => sum + d.totalIssues, 0) / trendData.length)
    const maxDay = trendData.reduce((max, d) => d.totalIssues > max.totalIssues ? d : max, trendData[0])
    const minDay = trendData.reduce((min, d) => d.totalIssues < min.totalIssues ? d : min, trendData[0])
    return { avgDaily, maxDay, minDay }
  }, [trendData])

  const vsPreviousLabel = `${comparison.change > 0 ? '+' : ''}${t('mockTrends.vsPrevious', { change: comparison.change })}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3"><TrendingUp className="h-7 w-7 text-[#4CAF50]" />{t('mockTrends.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('mockTrends.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedAgency} onValueChange={setSelectedAgency}>
            <SelectTrigger className="w-[180px] border-border"><SelectValue placeholder={t('dealer.label')} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t('dealer.all')}</SelectItem>{agencies.slice(0, 20).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as '7' | '14' | '30')}>
            <SelectTrigger className="w-[140px] border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('filters.last7Days')}</SelectItem>
              <SelectItem value="14">{t('mockTrends.last14Days')}</SelectItem>
              <SelectItem value="30">{t('filters.last30Days')}</SelectItem>
            </SelectContent>
          </Select>
          <ExportButton data={trendData} filename="trends-report" title={t('mockTrends.exportTitle')} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">{t('mockTrends.periodTotal')}</p><p className="text-2xl font-bold text-foreground">{comparison.currentCount}</p><p className={`text-xs ${comparison.change > 0 ? 'text-red-500' : 'text-[#4CAF50]'}`}>{vsPreviousLabel}</p></CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">{t('mockTrends.dailyAverage')}</p><p className="text-2xl font-bold text-foreground">{stats.avgDaily}</p><p className="text-xs text-muted-foreground">{t('mockTrends.issuesPerDay')}</p></CardContent></Card>
        <Card className="bg-red-500/10 border-red-500/30"><CardContent className="pt-4 pb-4"><p className="text-xs text-red-500">{t('mockTrends.worstDay')}</p><p className="text-2xl font-bold text-red-500">{stats.maxDay?.totalIssues || 0}</p><p className="text-xs text-red-400">{stats.maxDay?.displayDate}</p></CardContent></Card>
        <Card className="bg-[#4CAF50]/10 border-[#4CAF50]/30"><CardContent className="pt-4 pb-4"><p className="text-xs text-[#4CAF50]">{t('mockTrends.bestDay')}</p><p className="text-2xl font-bold text-[#4CAF50]">{stats.minDay?.totalIssues || 0}</p><p className="text-xs text-[#4CAF50]">{stats.minDay?.displayDate}</p></CardContent></Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockTrends.issueEvolution')}</CardTitle></CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs><linearGradient id="colorIssues" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="displayDate" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }} />
                <Legend />
                <Area type="monotone" dataKey="totalIssues" name={t('mockTrends.chartTotal')} stroke="#ef4444" fill="url(#colorIssues)" strokeWidth={2} />
                <Line type="monotone" dataKey="lateArrivals" name={t('mockTrends.chartLateArrivals')} stroke="#FF9800" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="missingPunches" name={t('mockTrends.chartMissingPunches')} stroke="#2196F3" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockTrends.distributionByType')}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={issueDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="count" label={({ percentage }) => `${percentage}%`} labelLine={false}>{issueDistribution.map((entry, index) => <Cell key={entry.type} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }} formatter={(value, _name, props) => [value, (props.payload as { name: string }).name]} /><Legend formatter={(_value, entry) => (entry.payload as { name?: string })?.name ?? _value} wrapperStyle={{ fontSize: '11px' }} /></PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockTrends.issuesByDayOfWeek')}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={heatmapData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="day" stroke="#64748b" fontSize={12} /><YAxis stroke="#64748b" fontSize={12} /><Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }} /><Legend /><Bar dataKey="lateArrivals" name={t('mockTrends.chartLateArrivals')} fill="#FF9800" radius={[4, 4, 0, 0]} /><Bar dataKey="missing" name={t('mockTrends.chartMissingPunches')} fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{t('mockTrends.dealersMostIssues')}</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topAgencies} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" stroke="#64748b" fontSize={12} /><YAxis type="category" dataKey="agency.name" stroke="#64748b" fontSize={10} width={150} tickFormatter={(v) => v.length > 20 ? v.slice(0, 20) + '...' : v} /><Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b' }} /><Bar dataKey="issueCount" name={t('mockTrends.chartTotalIssues')} fill="#ef4444" radius={[0, 4, 4, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
