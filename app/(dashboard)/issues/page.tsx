'use client'

import { useMemo } from 'react'
import { issues } from '@/lib/mock-data'
import { useFilters } from '@/lib/filter-context'
import { TtkWithoutGroupTable } from '@/components/ttk/ttk-without-group-table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  LogOut,
  Hand,
  Trash2,
  DollarSign,
  UtensilsCrossed,
  TrendingUp,
  CheckCircle2,
  Clock4,
} from 'lucide-react'

export default function IssuesPage() {
  const { setSelectedType } = useFilters()

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

  const totalPending = issues.filter(i => i.status === 'pending').length
  const totalResolved = issues.filter(i => i.status !== 'pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 ring-1 ring-red-200">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Punch Issues</h1>
            <p className="text-sm text-muted-foreground">
              Without group — same list as TTK main (api.datatable ttk-list)
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
            <Clock4 className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-medium">{totalPending} pending</span>
          </Badge>
          <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span className="font-medium">{totalResolved} resolved</span>
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Card
          className="group cursor-pointer border-border transition-all hover:border-orange-300 hover:shadow-sm"
          onClick={() => setSelectedType('only_error')}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 group-hover:bg-orange-200">
                <UtensilsCrossed className="h-4 w-4 text-orange-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.missingLunch.total}</span>
            </div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Only with errors</p>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] font-medium text-green-600">{issueStats.missingLunch.fixed} fixed</span>
              <span className="text-[11px] font-medium text-orange-600">{issueStats.missingLunch.pending} pending</span>
            </div>
          </CardContent>
        </Card>

        <Card
          className="group cursor-pointer border-border transition-all hover:border-red-300 hover:shadow-sm"
          onClick={() => setSelectedType('only_error_clockout')}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 group-hover:bg-red-200">
                <LogOut className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.missingClockOut.total}</span>
            </div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Only without clock out</p>
          </CardContent>
        </Card>

        <Card
          className="group cursor-pointer border-border transition-all hover:border-blue-300 hover:shadow-sm"
          onClick={() => setSelectedType('manual_punch')}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 group-hover:bg-blue-200">
                <Hand className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.manualPunch}</span>
            </div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Manual punch</p>
            <TrendingUp className="mt-1 h-3 w-3 text-blue-500" />
          </CardContent>
        </Card>

        <Card
          className="group cursor-pointer border-border transition-all hover:border-purple-300 hover:shadow-sm"
          onClick={() => setSelectedType('only_deletes')}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 group-hover:bg-purple-200">
                <Trash2 className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.deletedPunch}</span>
            </div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Deleted punches</p>
          </CardContent>
        </Card>

        <Card
          className="group cursor-pointer border-border transition-all hover:border-emerald-300 hover:shadow-sm"
          onClick={() => setSelectedType('without_salary')}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 group-hover:bg-emerald-200">
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-2xl font-bold text-foreground">{issueStats.modifiedPayment}</span>
            </div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Without salary</p>
          </CardContent>
        </Card>
      </div>

      <TtkWithoutGroupTable />
    </div>
  )
}
