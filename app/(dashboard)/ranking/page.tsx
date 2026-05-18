'use client'

import { useState, useMemo } from 'react'
import { getEmployeeRankings, agencies } from '@/lib/mock-data'
import { EmployeeAvatar } from '@/components/employees/employee-avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Trophy, Search, Medal, TrendingUp, TrendingDown, Star, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExportButton } from '@/components/shared/export-button'

export default function RankingPage() {
  const [search, setSearch] = useState('')
  const [selectedAgency, setSelectedAgency] = useState<string>('all')
  const [view, setView] = useState<'best' | 'worst'>('best')
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 20

  const rankings = getEmployeeRankings()

  const filteredRankings = useMemo(() => {
    let result = [...rankings]
    if (search) { const s = search.toLowerCase(); result = result.filter(r => r.employee.firstName.toLowerCase().includes(s) || r.employee.lastName.toLowerCase().includes(s)) }
    if (selectedAgency !== 'all') result = result.filter(r => r.employee.agencyId === selectedAgency)
    result.sort((a, b) => view === 'best' ? b.punctualityScore - a.punctualityScore : a.punctualityScore - b.punctualityScore)
    return result
  }, [rankings, search, selectedAgency, view])

  const totalPages = Math.ceil(filteredRankings.length / pageSize)
  const paginatedRankings = filteredRankings.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  const topThree = filteredRankings.slice(0, 3)

  const stats = useMemo(() => ({ avgScore: Math.round(rankings.reduce((s, r) => s + r.punctualityScore, 0) / rankings.length), perfectScore: rankings.filter(r => r.punctualityScore === 100).length, criticalScore: rankings.filter(r => r.punctualityScore < 50).length, totalIssues: rankings.reduce((s, r) => s + r.totalIssues, 0) }), [rankings])

  const getScoreColor = (score: number) => score >= 90 ? 'text-[#4CAF50]' : score >= 70 ? 'text-[#2196F3]' : score >= 50 ? 'text-[#FF9800]' : 'text-red-500'
  const getScoreBgColor = (score: number) => score >= 90 ? 'bg-[#4CAF50]/10 border-[#4CAF50]/30' : score >= 70 ? 'bg-[#2196F3]/10 border-[#2196F3]/30' : score >= 50 ? 'bg-[#FF9800]/10 border-[#FF9800]/30' : 'bg-red-500/10 border-red-500/30'
  const getMedalColor = (i: number) => i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : 'text-amber-600'

  const exportData = filteredRankings.map(r => ({ 'Employee': `${r.employee.firstName} ${r.employee.lastName}`, 'Dealer': r.agency.name, 'Score': r.punctualityScore, 'Issues': r.totalIssues, 'Days Worked': r.totalDaysWorked, 'Overtime Hours': r.overtimeHours }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3"><Trophy className="h-7 w-7 text-yellow-500" />Employee Ranking</h1>
          <p className="text-muted-foreground mt-1">Classification by punctuality and compliance</p>
        </div>
        <ExportButton data={exportData} filename="employee-ranking" title="Employee Ranking Report" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Average Score</p><p className="text-2xl font-bold text-foreground">{stats.avgScore}%</p></div><Star className="h-8 w-8 text-muted-foreground/50" /></div></CardContent></Card>
        <Card className="bg-[#4CAF50]/10 border-[#4CAF50]/30"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[#4CAF50]">Perfect Score (100)</p><p className="text-2xl font-bold text-[#4CAF50]">{stats.perfectScore}</p></div><TrendingUp className="h-8 w-8 text-[#4CAF50]/50" /></div></CardContent></Card>
        <Card className="bg-red-500/10 border-red-500/30"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-red-500">Critical Score (&lt;50)</p><p className="text-2xl font-bold text-red-500">{stats.criticalScore}</p></div><TrendingDown className="h-8 w-8 text-red-500/50" /></div></CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="pt-4 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Total Issues</p><p className="text-2xl font-bold text-foreground">{stats.totalIssues}</p></div><AlertTriangle className="h-8 w-8 text-muted-foreground/50" /></div></CardContent></Card>
      </div>

      {topThree.length >= 3 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-lg font-medium text-foreground">{view === 'best' ? 'Top 3 Most Punctual' : 'Top 3 Most Issues'}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end justify-center gap-8 py-6">
              <div className="flex flex-col items-center"><div className="relative"><EmployeeAvatar employee={topThree[1].employee} size="lg" /><div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-white font-bold text-sm">2</div></div><p className="mt-3 text-sm font-medium text-foreground">{topThree[1].employee.firstName}</p><p className="text-xs text-muted-foreground">{topThree[1].agency.name.split(' ')[0]}</p><p className={cn('text-lg font-bold mt-1', getScoreColor(topThree[1].punctualityScore))}>{topThree[1].punctualityScore}%</p><div className="h-20 w-24 bg-gray-400/20 rounded-t-lg mt-2" /></div>
              <div className="flex flex-col items-center"><div className="relative"><div className="absolute -top-6 left-1/2 -translate-x-1/2"><Trophy className="h-8 w-8 text-yellow-500" /></div><EmployeeAvatar employee={topThree[0].employee} size="lg" /><div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500 text-white font-bold text-sm">1</div></div><p className="mt-3 text-sm font-medium text-foreground">{topThree[0].employee.firstName}</p><p className="text-xs text-muted-foreground">{topThree[0].agency.name.split(' ')[0]}</p><p className={cn('text-lg font-bold mt-1', getScoreColor(topThree[0].punctualityScore))}>{topThree[0].punctualityScore}%</p><div className="h-28 w-24 bg-yellow-500/20 rounded-t-lg mt-2" /></div>
              <div className="flex flex-col items-center"><div className="relative"><EmployeeAvatar employee={topThree[2].employee} size="lg" /><div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-600 text-white font-bold text-sm">3</div></div><p className="mt-3 text-sm font-medium text-foreground">{topThree[2].employee.firstName}</p><p className="text-xs text-muted-foreground">{topThree[2].agency.name.split(' ')[0]}</p><p className={cn('text-lg font-bold mt-1', getScoreColor(topThree[2].punctualityScore))}>{topThree[2].punctualityScore}%</p><div className="h-14 w-24 bg-amber-600/20 rounded-t-lg mt-2" /></div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <Tabs defaultValue="best" onValueChange={(v) => { setView(v as 'best' | 'worst'); setPageIndex(0) }}>
          <TabsList><TabsTrigger value="best" className="gap-2"><TrendingUp className="h-4 w-4" />Most Punctual</TabsTrigger><TabsTrigger value="worst" className="gap-2"><TrendingDown className="h-4 w-4" />Most Issues</TabsTrigger></TabsList>
        </Tabs>
        <div className="flex items-center gap-3">
          <div className="relative w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search employee..." value={search} onChange={(e) => { setSearch(e.target.value); setPageIndex(0) }} className="pl-10 bg-background border-border" /></div>
          <Select value={selectedAgency} onValueChange={(v) => { setSelectedAgency(v); setPageIndex(0) }}><SelectTrigger className="w-[180px] border-border"><SelectValue placeholder="Dealer" /></SelectTrigger><SelectContent><SelectItem value="all">All Dealers</SelectItem>{agencies.slice(0, 20).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="bg-[#1565C0] text-white"><th className="px-4 py-3 text-left text-xs font-medium w-16 rounded-tl-md">#</th><th className="px-4 py-3 text-left text-xs font-medium">Employee</th><th className="px-4 py-3 text-left text-xs font-medium">Dealer</th><th className="px-4 py-3 text-center text-xs font-medium">Score</th><th className="px-4 py-3 text-center text-xs font-medium">Issues</th><th className="px-4 py-3 text-center text-xs font-medium">Days Worked</th><th className="px-4 py-3 text-center text-xs font-medium">Overtime</th><th className="px-4 py-3 text-left text-xs font-medium w-40 rounded-tr-md">Progress</th></tr></thead>
            <tbody className="divide-y divide-border">
              {paginatedRankings.map((ranking, index) => {
                const globalIndex = pageIndex * pageSize + index
                return (
                  <tr key={ranking.employeeId} className={`hover:bg-muted/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}>
                    <td className="px-4 py-3"><div className="flex items-center gap-2">{globalIndex < 3 ? <Medal className={cn('h-5 w-5', getMedalColor(globalIndex))} /> : <span className="text-sm font-medium text-muted-foreground w-5 text-center">{globalIndex + 1}</span>}</div></td>
                    <td className="px-4 py-3"><EmployeeAvatar employee={ranking.employee} size="sm" showName showPosition /></td>
                    <td className="px-4 py-3"><span className="text-sm text-foreground">{ranking.agency.name}</span></td>
                    <td className="px-4 py-3 text-center"><Badge variant="outline" className={cn('font-bold', getScoreBgColor(ranking.punctualityScore))}><span className={getScoreColor(ranking.punctualityScore)}>{ranking.punctualityScore}%</span></Badge></td>
                    <td className="px-4 py-3 text-center"><span className={cn('text-sm font-medium', ranking.totalIssues === 0 ? 'text-[#4CAF50]' : ranking.totalIssues < 5 ? 'text-foreground' : 'text-red-500')}>{ranking.totalIssues}</span></td>
                    <td className="px-4 py-3 text-center"><span className="text-sm text-foreground">{ranking.totalDaysWorked}</span></td>
                    <td className="px-4 py-3 text-center"><span className="text-sm text-[#2196F3]">{ranking.overtimeHours}h</span></td>
                    <td className="px-4 py-3"><Progress value={ranking.punctualityScore} className="h-2" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">Showing {paginatedRankings.length} of {filteredRankings.length}</p>
            <div className="flex items-center gap-1"><Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex - 1)} disabled={pageIndex === 0}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground px-2">{pageIndex + 1} / {totalPages}</span><Button variant="outline" size="icon" onClick={() => setPageIndex(pageIndex + 1)} disabled={pageIndex >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
