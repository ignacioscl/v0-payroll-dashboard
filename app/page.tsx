'use client'

import { 
  Users, 
  AlertTriangle, 
  Clock, 
  Timer, 
  DollarSign, 
  Building2,
  TrendingUp,
  TrendingDown
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
  Legend
} from 'recharts'
import { EmployeeAvatar } from '@/components/employees/employee-avatar'
import { IssueTypeBadge, StatusBadge } from '@/components/shared/status-badge'
import { format } from 'date-fns'
import Link from 'next/link'

const COLORS = ['#ef4444', '#FF9800', '#2196F3', '#9C27B0', '#E91E63', '#00ACC1', '#4CAF50', '#673AB7']

export default function DashboardPage() {
  const kpis = getDashboardKPIs()
  const trendData = getTrendData()
  const issueDistribution = getIssueDistribution()
  const topAgencies = getTopAgenciesWithIssues(5)
  const recentIssues = issues.slice(0, 8)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Executive summary of time tracking and attendance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Employees"
          value={kpis.activeEmployees}
          subtitle={`In ${kpis.totalAgencies} dealers`}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Issues Today"
          value={kpis.todayIssues}
          subtitle={`${kpis.weekIssues} this week`}
          icon={AlertTriangle}
          variant="danger"
          trend={{ value: -8, label: 'vs last week' }}
        />
        <KPICard
          title="Schedule Violations"
          value={kpis.scheduleIssues}
          subtitle="Today"
          icon={Clock}
          variant="warning"
        />
        <KPICard
          title="Weekly Overtime"
          value={`${kpis.weekOvertime}h`}
          subtitle={`$${kpis.weekOvertimeCost.toLocaleString()}`}
          icon={Timer}
          variant="default"
        />
      </div>

      {/* Second row of KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Pending Review"
          value={kpis.pendingIssues}
          subtitle="Require attention"
          icon={AlertTriangle}
          variant="warning"
        />
        <KPICard
          title="Total Dealers"
          value={kpis.totalAgencies}
          icon={Building2}
          variant="default"
        />
        <KPICard
          title="Weekly Cost"
          value={`$${kpis.weekOvertimeCost.toLocaleString()}`}
          subtitle="In overtime"
          icon={DollarSign}
          variant="default"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#2196F3]" />
              Issue Trend (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="displayDate" 
                    stroke="#64748b" 
                    fontSize={12}
                  />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      color: '#1e293b'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="issues" 
                    name="Total Issues"
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ fill: '#ef4444' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="lateArrivals" 
                    name="Late Arrivals"
                    stroke="#FF9800" 
                    strokeWidth={2}
                    dot={{ fill: '#FF9800' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="missingPunches" 
                    name="Missing Punches"
                    stroke="#2196F3" 
                    strokeWidth={2}
                    dot={{ fill: '#2196F3' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribution Pie Chart */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-foreground">
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
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="type"
                    label={({ percentage }) => `${percentage}%`}
                    labelLine={false}
                  >
                    {issueDistribution.map((entry, index) => (
                      <Cell key={entry.type} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      color: '#1e293b'
                    }}
                    formatter={(value, name) => [value, issueTypeLabels[name as keyof typeof issueTypeLabels]]}
                  />
                  <Legend 
                    formatter={(value) => issueTypeLabels[value as keyof typeof issueTypeLabels]}
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Agencies with Issues */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              Dealers with Most Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topAgencies.map((item, index) => (
                <div key={item.agency.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-sm font-medium text-red-500">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.agency.name}</p>
                      <p className="text-xs text-muted-foreground">{item.agency.employeeCount} employees</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-red-500">{item.issueCount}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Issues Table */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium text-foreground">
              Recent Issues
            </CardTitle>
            <Link 
              href="/issues" 
              className="text-sm text-[#2196F3] hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#1565C0] text-white">
                    <th className="px-3 py-2 text-left text-xs font-medium rounded-tl-md">Employee</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Dealer</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Issue</th>
                    <th className="px-3 py-2 text-left text-xs font-medium rounded-tr-md">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentIssues.map(issue => {
                    const employee = getEmployeeById(issue.employeeId)
                    const agency = getAgencyById(issue.agencyId)
                    if (!employee || !agency) return null
                    
                    return (
                      <tr key={issue.id} className="hover:bg-muted/50">
                        <td className="px-3 py-3">
                          <EmployeeAvatar employee={employee} size="sm" showName />
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm text-muted-foreground">{agency.name}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm text-foreground">
                            {format(new Date(issue.date), 'MMM dd')}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <IssueTypeBadge type={issue.type} />
                        </td>
                        <td className="px-3 py-3">
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
      </div>
    </div>
  )
}
