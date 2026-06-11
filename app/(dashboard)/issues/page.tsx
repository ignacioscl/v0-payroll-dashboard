'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFilters } from '@/lib/filter-context'
import { useTtkIssueCounts } from '@/hooks/use-ttk-issue-counts'
import { IssuesDataTable } from '@/components/ttk/issues-data-table'
import { PunchReportFilterPanel } from '@/components/ttk/punch-report-filter-panel'
import { AddPunchDialog } from '@/components/ttk/add-punch-dialog'
import { KPICard, type KPICardVariant } from '@/components/dashboard/kpi-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAddOrEditPunch, canDeletePunch, canViewPaymentType } from '@/lib/auth/ttk-permissions'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { usePaymentTypesCatalog } from '@/hooks/use-payment-types-catalog'
import {
  PAYMENT_TYPE_FILTER_ALL,
  PAYMENT_TYPE_FILTER_WITHOUT,
  type PaymentTypeFilterValue,
} from '@/lib/ttk/payment-type-filter'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import {
  AlertTriangle,
  LogOut,
  Hand,
  Trash2,
  DollarSign,
  PlusCircle,
  CheckCheck,
  Coffee,
} from 'lucide-react'
import { toast } from 'sonner'

type IssueType =
  | 'only_error'
  | 'only_error_clockout'
  | 'only_error_break'
  | 'manual_punch'
  | 'only_deletes'
  | 'without_salary'
  | 'only_fixed'

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
    icon: <AlertTriangle className="h-5 w-5" />,
    variant: 'warning',
  },
  {
    type: 'only_error_clockout',
    title: 'Without clock out',
    icon: <LogOut className="h-5 w-5" />,
    variant: 'danger',
  },
  {
    type: 'only_error_break',
    title: 'Without break',
    icon: <Coffee className="h-5 w-5" />,
    variant: 'warning',
  },
  {
    type: 'manual_punch',
    title: 'Manual punch',
    icon: <Hand className="h-5 w-5" />,
    variant: 'info',
  },
  {
    type: 'only_deletes',
    title: 'Deleted punches',
    icon: <Trash2 className="h-5 w-5" />,
    variant: 'violet',
  },
  {
    type: 'without_salary',
    title: 'Without salary',
    icon: <DollarSign className="h-5 w-5" />,
    variant: 'success',
  },
  {
    type: 'only_fixed',
    title: 'Corrected punches',
    icon: <CheckCheck className="h-5 w-5" />,
    variant: 'info',
  },
]

export default function IssuesPage() {
  const [addPunchOpen, setAddPunchOpen] = useState(false)
  const [punchMinHoursRaw, setPunchMinHoursRaw] = useState('')
  const [punchMaxHoursRaw, setPunchMaxHoursRaw] = useState('')
  const [paymentTypeFilter, setPaymentTypeFilter] =
    useState<PaymentTypeFilterValue>(PAYMENT_TYPE_FILTER_ALL)
  const {
    search,
    selectedDealers,
    dateRange,
    selectedType,
    setSelectedType,
    setSelectedTodayLiveStatus,
    filtersHydrated,
  } = useFilters()

  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const { dealers } = useSrsDealers()
  const canAdd = canAddOrEditPunch(hasPermission, user?.isSystemAdmin)
  const canViewDeleted = canDeletePunch(hasPermission, user?.isSystemAdmin)
  const canViewPayment = canViewPaymentType(hasPermission, user?.isSystemAdmin)

  const { data: paymentTypeOptions = [], isLoading: paymentTypesLoading } =
    usePaymentTypesCatalog(filtersHydrated && canViewPayment && !meLoading)

  useEffect(() => {
    if (!canViewPayment) return
    if (selectedType === 'without_salary') {
      setPaymentTypeFilter(PAYMENT_TYPE_FILTER_WITHOUT)
    } else {
      setPaymentTypeFilter((prev) =>
        prev === PAYMENT_TYPE_FILTER_WITHOUT ? PAYMENT_TYPE_FILTER_ALL : prev,
      )
    }
  }, [selectedType, canViewPayment])

  const handlePaymentTypeFilterChange = (next: PaymentTypeFilterValue) => {
    setPaymentTypeFilter(next)
    if (next === PAYMENT_TYPE_FILTER_WITHOUT) {
      setSelectedType('without_salary')
      return
    }
    if (selectedType === 'without_salary') {
      setSelectedType('all')
    }
  }

  const singleDealerId = useMemo(() => {
    if (selectedDealers.length !== 1) return null
    const id = Number(selectedDealers[0])
    return Number.isFinite(id) && id > 0 ? id : null
  }, [selectedDealers])

  const singleDealerName = useMemo(() => {
    if (!singleDealerId) return undefined
    return dealers.find((d) => String(d.id) === String(singleDealerId))?.label
  }, [dealers, singleDealerId])

  const visibleIssueCards = useMemo(
    () =>
      ISSUE_CARDS.filter(
        (card) => card.type !== 'only_deletes' || canViewDeleted,
      ),
    [canViewDeleted],
  )

  const { counts, loading } = useTtkIssueCounts({
    search,
    selectedDealers,
    dateRange,
    filtersHydrated,
  })

  const selectFilter = (type: string) => {
    const next = selectedType === type ? 'all' : type
    setSelectedType(next)
    if (next !== 'all') {
      setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    }
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

  const handleAddPunchClick = () => {
    if (selectedDealers.length === 0) {
      toast.error('Select one dealer in the header to add a punch.')
      return
    }
    if (selectedDealers.length > 1) {
      toast.error('Select only one dealer in the header to add a punch.')
      return
    }
    if (singleDealerId == null) {
      toast.error('The selected dealer is invalid. Choose a dealer again.')
      return
    }
    setAddPunchOpen(true)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Punch Report</h1>
          <p className="mt-1 text-muted-foreground">
            Without group — live counts from TTK punch validation
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!meLoading && canAdd && (
            <Button
              size="sm"
              className="gap-1.5 cursor-pointer"
              onClick={handleAddPunchClick}
            >
              <PlusCircle className="h-4 w-4" />
              Add punch
            </Button>
          )}
          <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-medium tabular-nums">
              {loading ? '…' : totalPending} with errors
            </span>
          </Badge>
        </div>
      </div>

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Select dealers in the header to load issue counts.
        </p>
      ) : null}

      <PunchReportFilterPanel
        punchMinHours={punchMinHoursRaw}
        punchMaxHours={punchMaxHoursRaw}
        onPunchMinHoursChange={setPunchMinHoursRaw}
        onPunchMaxHoursChange={setPunchMaxHoursRaw}
        paymentTypeFilter={paymentTypeFilter}
        onPaymentTypeFilterChange={handlePaymentTypeFilterChange}
        paymentTypeOptions={paymentTypeOptions}
        showPaymentTypeFilter={canViewPayment && !meLoading}
        paymentTypesLoading={paymentTypesLoading}
        issueCards={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleIssueCards.map((card) => (
              <KPICard
                key={card.type}
                title={card.title}
                value={counts[card.type].pending}
                icon={card.icon}
                variant={card.variant}
                loading={loading}
                filterCard
                onClick={() => selectFilter(card.type)}
                active={selectedType === card.type}
                subtitle={renderSubtitle(card.type)}
              />
            ))}
          </div>
        }
      />

      <IssuesDataTable
        punchMinHoursRaw={punchMinHoursRaw}
        punchMaxHoursRaw={punchMaxHoursRaw}
        paymentTypeFilter={paymentTypeFilter}
        onPaymentTypeFilterChange={handlePaymentTypeFilterChange}
        showToolbarFilters={false}
      />

      {canAdd && (
        <AddPunchDialog
          open={addPunchOpen}
          onOpenChange={setAddPunchOpen}
          idDealer={singleDealerId}
          dealerName={singleDealerName}
        />
      )}
    </div>
  )
}
