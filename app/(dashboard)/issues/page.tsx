'use client'

import { useFilters } from '@/lib/filter-context'
import { useTtkIssueCounts } from '@/hooks/use-ttk-issue-counts'
import { TtkWithoutGroupTable } from '@/components/ttk/ttk-without-group-table'
import { KPICard, type KPICardVariant } from '@/components/dashboard/kpi-card'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  LogOut,
  Hand,
  Trash2,
  DollarSign,
} from 'lucide-react'

type IssueType =
  | 'only_error'
  | 'only_error_clockout'
  | 'manual_punch'
  | 'only_deletes'
  | 'without_salary'

interface IssueCardConfig {
  type: IssueType
  title: string
  icon: React.ReactNode
  variant: KPICardVariant
}

const ISSUE_CARDS: IssueCardConfig[] = [
  {
    type: 'only_error',
    title: 'Only with errors',
    icon: <AlertTriangle className="h-7 w-7" />,
    variant: 'warning',
  },
  {
    type: 'only_error_clockout',
    title: 'Without clock out',
    icon: <LogOut className="h-7 w-7" />,
    variant: 'danger',
  },
  {
    type: 'manual_punch',
    title: 'Manual punch',
    icon: <Hand className="h-7 w-7" />,
    variant: 'info',
  },
  {
    type: 'only_deletes',
    title: 'Deleted punches',
    icon: <Trash2 className="h-7 w-7" />,
    variant: 'violet',
  },
  {
    type: 'without_salary',
    title: 'Without salary',
    icon: <DollarSign className="h-7 w-7" />,
    variant: 'success',
  },
]

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

  const renderSubtitle = (type: IssueType): React.ReactNode => {
    if (type === 'only_error' && counts.only_error.by_type) {
      const { clock_out_missing, break_missing, shift_20h_plus } = counts.only_error.by_type
      return (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
          <span>Clock out: <span className="font-medium text-foreground">{clock_out_missing}</span></span>
          <span>Break: <span className="font-medium text-foreground">{break_missing}</span></span>
          <span>20h+: <span className="font-medium text-foreground">{shift_20h_plus}</span></span>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Punch Issues</h1>
          <p className="mt-1 text-muted-foreground">
            Without group — live counts from TTK punch validation
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
          <span className="font-medium tabular-nums">
            {loading ? '…' : totalPending} with errors
          </span>
        </Badge>
      </div>

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Select dealers in the header to load issue counts.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {ISSUE_CARDS.map((card) => (
          <KPICard
            key={card.type}
            title={card.title}
            value={counts[card.type].pending}
            icon={card.icon}
            variant={card.variant}
            loading={loading}
            onClick={() => selectFilter(card.type)}
            active={selectedType === card.type}
            subtitle={renderSubtitle(card.type)}
          />
        ))}
      </div>

      <TtkWithoutGroupTable />
    </div>
  )
}
