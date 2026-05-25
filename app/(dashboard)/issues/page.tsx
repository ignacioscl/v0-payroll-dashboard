'use client'

import { useFilters } from '@/lib/filter-context'
import { useTtkIssueCounts } from '@/hooks/use-ttk-issue-counts'
import { TtkWithoutGroupTable } from '@/components/ttk/ttk-without-group-table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  LogOut,
  Hand,
  Trash2,
  DollarSign,
  Loader2,
} from 'lucide-react'

type IssueCardProps = {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  iconBg: string
  hoverBorder: string
  label: string
  count: number | string
  loading?: boolean
  subtitle?: React.ReactNode
}

function IssueCard({
  active,
  onClick,
  icon,
  iconBg,
  hoverBorder,
  label,
  count,
  loading,
  subtitle,
}: IssueCardProps) {
  return (
    <Card
      className={cn(
        'group cursor-pointer border-border transition-all hover:shadow-sm',
        hoverBorder,
        active && 'border-primary ring-1 ring-primary/30',
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between">
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBg)}>{icon}</div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-2xl font-bold tabular-nums text-foreground">{count}</span>
          )}
        </div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {subtitle}
      </CardContent>
    </Card>
  )
}

export default function IssuesPage() {
  const {
    search,
    selectedDealers,
    dateRange,
    selectedType,
    setSelectedType,
    filtersHydrated,
  } = useFilters()

  const { counts, loading } = useTtkIssueCounts({
    search,
    selectedDealers,
    dateRange,
    filtersHydrated,
  })

  const selectFilter = (type: string) => {
    setSelectedType(selectedType === type ? 'all' : type)
  }

  const totalPending = counts.only_error.pending

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
              Without group — live counts from TTK punch validation
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
          <span className="font-medium tabular-nums">
            {loading ? '…' : totalPending} with errors
          </span>
        </Badge>
      </div>

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Select dealers in the header to load issue counts.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <IssueCard
          active={selectedType === 'only_error'}
          onClick={() => selectFilter('only_error')}
          icon={<AlertTriangle className="h-4 w-4 text-orange-600" />}
          iconBg="bg-orange-100 group-hover:bg-orange-200"
          hoverBorder="hover:border-orange-300"
          label="Only with errors"
          count={counts.only_error.pending}
          loading={loading}
          subtitle={
            counts.only_error.by_type ? (
              <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                <div>Clock out: {counts.only_error.by_type.clock_out_missing}</div>
                <div>Break: {counts.only_error.by_type.break_missing}</div>
                <div>20h+: {counts.only_error.by_type.shift_20h_plus}</div>
              </div>
            ) : null
          }
        />

        <IssueCard
          active={selectedType === 'only_error_clockout'}
          onClick={() => selectFilter('only_error_clockout')}
          icon={<LogOut className="h-4 w-4 text-red-600" />}
          iconBg="bg-red-100 group-hover:bg-red-200"
          hoverBorder="hover:border-red-300"
          label="Only without clock out"
          count={counts.only_error_clockout.pending}
          loading={loading}
        />

        <IssueCard
          active={selectedType === 'manual_punch'}
          onClick={() => selectFilter('manual_punch')}
          icon={<Hand className="h-4 w-4 text-blue-600" />}
          iconBg="bg-blue-100 group-hover:bg-blue-200"
          hoverBorder="hover:border-blue-300"
          label="Manual punch"
          count={counts.manual_punch.pending}
          loading={loading}
        />

        <IssueCard
          active={selectedType === 'only_deletes'}
          onClick={() => selectFilter('only_deletes')}
          icon={<Trash2 className="h-4 w-4 text-purple-600" />}
          iconBg="bg-purple-100 group-hover:bg-purple-200"
          hoverBorder="hover:border-purple-300"
          label="Deleted punches"
          count={counts.only_deletes.pending}
          loading={loading}
        />

        <IssueCard
          active={selectedType === 'without_salary'}
          onClick={() => selectFilter('without_salary')}
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          iconBg="bg-emerald-100 group-hover:bg-emerald-200"
          hoverBorder="hover:border-emerald-300"
          label="Without salary"
          count={counts.without_salary.pending}
          loading={loading}
        />
      </div>

      <TtkWithoutGroupTable />
    </div>
  )
}
