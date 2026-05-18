'use client'

import { 
  Users, 
  AlertTriangle, 
  Clock, 
  Timer, 
  DollarSign, 
  Building2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Activity
} from 'lucide-react'
import { KPICard } from '@/components/dashboard/kpi-card'
import { 
  getDashboardKPIs, 
  getTrendData, 
  getIssueDistribution, 
  getTopAgenciesWithIssues,
  issues,
  getEmployeeById,
  getAgencyById
} from '@/lib/mock-data'
import { issueTypeLabels } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area
} from 'recharts'
import { EmployeeAvatar } from '@/components/employees/employee-avatar'
import { IssueTypeBadge, StatusBadge } from '@/components/shared/status-badge'
import { format } from 'date-fns'
import Link from 'next/link'
import { motion } from 'framer-motion'

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4', '#22c55e', '#6366f1']

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

export default function DashboardPage() {
  const kpis = getDashboardKPIs()
  const trendData = getTrendData()
  const issueDistribution = getIssueDistribution()
  const topAgencies = getTopAgenciesWithIssues(5)
  const recentIssues = issues.slice(0, 8)

  return (
    <motion.div 
      className="space-y-8"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Page Header */}
      <motion.div variants={item}>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Executive summary of time tracking and attendance
        </p>
      </motion.div>

      {/* KPI Cards */}
      <motion.div 
        variants={item}
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5"
      >
        <KPICard
          title="Active Employees"
          value={kpis.activeEmployees}
          subtitle={`Across ${kpis.totalAgencies} dealers`}
          icon={<Users className="h-7 w-7" />}
          variant="info"
        />
        <KPICard
          title="Issues Today"
          value={kpis.todayIssues}
          subtitle={`${kpis.weekIssues} this week`}
          icon={<AlertTriangle className="h-7 w-7" />}
          variant="danger"
          trend={{ value: -8, label: 'vs last week' }}
        />
        <KPICard
          title="Schedule Violations"
          value={kpis.scheduleIssues}
          subtitle="Today"
          icon={<Clock className="h-7 w-7" />}
          variant="warning"
        />
        <KPICard
          title="Weekly Overtime"
          value={`${kpis.weekOvertime}h`}
          subtitle={`$${kpis.weekOvertimeCost.toLocaleString()} cost`}
          icon={<Timer className="h-7 w-7" />}
          variant="success"
        />
      </motion.div>

      {/* Second row of KPIs */}
      <motion.div 
        variants={item}
        className="grid grid-cols-1 md:grid-cols-3 gap-5"
      >
        <KPICard
          title="Pending Review"
          value={kpis.pendingIssues}
          subtitle="Require attention"
          icon={<Activity className="h-7 w-7" />}
          variant="warning"
        />
        <KPICard
          title="Total Dealers"
          value={kpis.totalAgencies}
          subtitle="Active locations"
          icon={<Building2 className="h-7 w-7" />}
          variant="default"
        />
        <KPICard
          title="Weekly Cost"
          value={`$${kpis.weekOvertimeCost.toLocaleString()}`}
          subtitle="In overtime"
          icon={<DollarSign className="h-7 w-7" />}
          variant="default"
        />
      </motion.div>

      {/* Charts Row */}
      <motion.div 
        variants={item}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Trend Chart */}
        <Card className="bg-gradient-to-br from-white to-blue-50/50 border-blue-100 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              Issue Trend (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorIssues" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorMissing" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="displayDate" 
                    stroke="#64748b" 
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#64748b" 
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      color: '#0f172a',
                      boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.15)'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="issues" 
                    name="Total Issues"
                    stroke="#ef4444" 
                    strokeWidth={2}
                    fill="url(#colorIssues)"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="lateArrivals" 
                    name="Late Arrivals"
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    fill="url(#colorLate)"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="missingPunches" 
                    name="Missing Punches"
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    fill="url(#colorMissing)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribution Pie Chart */}
        <Card className="bg-gradient-to-br from-white to-cyan-50/50 border-cyan-100 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <Activity className="h-4 w-4 text-accent" />
              </div>
              Issue Distribution (Week)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={issueDistribution.filter(d => d.count > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="type"
                    label={({ percentage }) => `${percentage}%`}
                    labelLine={false}
                    strokeWidth={0}
                  >
                    {issueDistribution.map((entry, index) => (
                      <Cell key={entry.type} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      color: '#0f172a',
                      boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.15)'
                    }}
                    formatter={(value, name) => [value, issueTypeLabels[name as keyof typeof issueTypeLabels]]}
                  />
                  <Legend 
                    formatter={(value) => (
                      <span className="text-muted-foreground text-xs">
                        {issueTypeLabels[value as keyof typeof issueTypeLabels]}
                      </span>
                    )}
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Bottom Row */}
      <motion.div 
        variants={item}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Top Agencies with Issues */}
        <Card className="bg-gradient-to-br from-white to-red-50/50 border-red-100 overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
              Dealers with Most Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topAgencies.map((agencyItem, index) => (
                <motion.div 
                  key={agencyItem.agency.id} 
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${
                      index === 0 ? 'bg-destructive/20 text-destructive' :
                      index === 1 ? 'bg-warning/20 text-warning' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      #{index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{agencyItem.agency.name}</p>
                      <p className="text-xs text-muted-foreground">{agencyItem.agency.employeeCount} employees</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-destructive">{agencyItem.issueCount}</span>
                    <span className="text-xs text-muted-foreground">issues</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Issues Table */}
        <Card className="bg-gradient-to-br from-white to-slate-50/80 border-slate-100 lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <AlertTriangle className="h-4 w-4 text-primary" />
              </div>
              Recent Issues
            </CardTitle>
            <Link 
              href="/issues" 
              className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dealer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentIssues.map((issue) => {
                    const employee = getEmployeeById(issue.employeeId)
                    const agency = getAgencyById(issue.agencyId)
                    if (!employee || !agency) return null
                    
                    return (
                      <tr 
                        key={issue.id} 
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <EmployeeAvatar employee={employee} size="sm" showName />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{agency.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground" suppressHydrationWarning>
                            {format(new Date(issue.date), 'MMM dd')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <IssueTypeBadge type={issue.type} />
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
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
