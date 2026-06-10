'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useFilters } from '@/lib/filter-context'
import {
  getDefaultDateRange,
  matchPreset,
  DATE_RANGE_PRESETS,
} from '@/lib/filters/date-range-presets'
import {
  TODAY_LIVE_STATUS_ALL,
  todayLiveStatusLabel,
} from '@/lib/ttk/today-live-status'
import {
  PAYMENT_TYPE_FILTER_ALL,
  PAYMENT_TYPE_FILTER_WITHOUT,
  type PaymentTypeFilterValue,
} from '@/lib/ttk/payment-type-filter'
import type { PaymentTypeCatalogItem } from '@/lib/ttk/payment-type-filter'
import { TodayLiveStatusFilterCards } from '@/components/ttk/today-live-status-filter-cards'

const STORAGE_KEY = 'punch-report-filters-open'

const ISSUE_TYPE_LABELS: Record<string, string> = {
  only_error: 'With errors',
  only_error_clockout: 'Without clock out',
  only_error_break: 'Without break',
  manual_punch: 'Manual punch',
  only_deletes: 'Deleted punches',
  without_salary: 'Without salary',
  only_fixed: 'Corrected punches',
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDateRangeLabel(
  from: Date | undefined,
  to: Date | undefined,
): string | null {
  if (!from) return null
  const end = to ?? from
  const today = new Date()
  if (sameDay(from, end) && sameDay(from, today)) return 'Today'
  if (sameDay(from, end)) return format(from, 'MMM d, yyyy')
  return `${format(from, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

type FilterChip = {
  key: string
  label: string
  onRemove?: () => void
}

export type PunchReportFilterPanelProps = {
  punchMinHours: string
  punchMaxHours: string
  onPunchMinHoursChange: (v: string) => void
  onPunchMaxHoursChange: (v: string) => void
  paymentTypeFilter: PaymentTypeFilterValue
  onPaymentTypeFilterChange: (v: PaymentTypeFilterValue) => void
  paymentTypeOptions: PaymentTypeCatalogItem[]
  issueCards: React.ReactNode
  className?: string
}

export function PunchReportFilterPanel({
  punchMinHours,
  punchMaxHours,
  onPunchMinHoursChange,
  onPunchMaxHoursChange,
  paymentTypeFilter,
  onPaymentTypeFilterChange,
  paymentTypeOptions,
  issueCards,
  className,
}: PunchReportFilterPanelProps) {
  const {
    search,
    setSearch,
    selectedDealers,
    selectedType,
    setSelectedType,
    selectedTodayLiveStatus,
    setSelectedTodayLiveStatus,
    dateRange,
    setDateRange,
  } = useFilters()

  const [open, setOpen] = React.useState(true)
  const [hydrated, setHydrated] = React.useState(false)
  const prevActiveKeyRef = React.useRef('')

  const defaultRange = React.useMemo(() => getDefaultDateRange(), [])

  const isDefaultDateRange =
    dateRange?.from &&
    dateRange?.to &&
    defaultRange.from &&
    defaultRange.to &&
    sameDay(dateRange.from, defaultRange.from) &&
    sameDay(dateRange.to, defaultRange.to)

  const activePreset = matchPreset(dateRange)

  const paymentTypeLabel = React.useMemo(() => {
    if (paymentTypeFilter === PAYMENT_TYPE_FILTER_ALL) return null
    if (paymentTypeFilter === PAYMENT_TYPE_FILTER_WITHOUT) return 'Without payment type'
    const opt = paymentTypeOptions.find((o) => o.id === paymentTypeFilter)
    return opt?.name ?? opt?.title ?? `Payment type #${paymentTypeFilter}`
  }, [paymentTypeFilter, paymentTypeOptions])

  const chips = React.useMemo((): FilterChip[] => {
    const list: FilterChip[] = []

    const dateLabel = formatDateRangeLabel(dateRange?.from, dateRange?.to)
    if (dateLabel && !isDefaultDateRange) {
      list.push({
        key: 'date',
        label: dateLabel,
        onRemove: () => setDateRange(getDefaultDateRange()),
      })
    }

    if (search.trim()) {
      list.push({
        key: 'search',
        label: `Search: “${search.trim()}”`,
        onRemove: () => setSearch(''),
      })
    }

    if (selectedDealers.length > 0) {
      list.push({
        key: 'dealers',
        label:
          selectedDealers.length === 1
            ? '1 dealer'
            : `${selectedDealers.length} dealers`,
      })
    }

    if (selectedType && selectedType !== 'all') {
      list.push({
        key: 'issue',
        label: ISSUE_TYPE_LABELS[selectedType] ?? selectedType,
        onRemove: () => setSelectedType('all'),
      })
    }

    if (selectedTodayLiveStatus !== TODAY_LIVE_STATUS_ALL) {
      list.push({
        key: 'live',
        label: todayLiveStatusLabel(selectedTodayLiveStatus),
        onRemove: () => setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL),
      })
    }

    if (punchMinHours.trim()) {
      list.push({
        key: 'min-hours',
        label: `More than ${punchMinHours}h`,
        onRemove: () => onPunchMinHoursChange(''),
      })
    }

    if (punchMaxHours.trim()) {
      list.push({
        key: 'max-hours',
        label: `Less than ${punchMaxHours}h`,
        onRemove: () => onPunchMaxHoursChange(''),
      })
    }

    if (paymentTypeLabel) {
      list.push({
        key: 'payment',
        label: paymentTypeLabel,
        onRemove: () => onPaymentTypeFilterChange(PAYMENT_TYPE_FILTER_ALL),
      })
    }

    return list
  }, [
    dateRange,
    isDefaultDateRange,
    search,
    selectedDealers.length,
    selectedType,
    selectedTodayLiveStatus,
    punchMinHours,
    punchMaxHours,
    paymentTypeLabel,
    setDateRange,
    setSearch,
    setSelectedType,
    setSelectedTodayLiveStatus,
    onPunchMinHoursChange,
    onPunchMaxHoursChange,
    onPaymentTypeFilterChange,
  ])

  const activeKey = chips.map((c) => c.key).join('|')

  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved === '0') setOpen(false)
      else if (saved === '1') setOpen(true)
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    if (activeKey && activeKey !== prevActiveKeyRef.current) {
      setOpen(true)
    }
    prevActiveKeyRef.current = activeKey
  }, [activeKey, hydrated])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    try {
      sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={cn(
        'rounded-xl border border-border/60 bg-card/40',
        className,
      )}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors',
            'hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t-xl',
            !open && chips.length === 0 && 'rounded-b-xl',
          )}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Filters
          </span>
          {!open ? (
            <span className="text-[11px] text-muted-foreground">
              {chips.length > 0
                ? `${chips.length} active`
                : 'Click to expand'}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Click to collapse
            </span>
          )}
        </button>
      </CollapsibleTrigger>

      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 border-t border-border/50 px-3 py-2',
          !open && 'rounded-b-xl',
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {chips.length > 0 ? (
          chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="outline"
              className="gap-1 bg-background py-0.5 pl-2 pr-1 text-[11px] font-normal"
            >
              {chip.label}
              {chip.onRemove ? (
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label={`Remove filter ${chip.label}`}
                  onClick={chip.onRemove}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </Badge>
          ))
        ) : (
          <span className="text-[11px] text-muted-foreground">
            No active filters — use the cards below or the header
          </span>
        )}
        {activePreset ? (
          <span className="text-[10px] text-muted-foreground">
            ({DATE_RANGE_PRESETS.find((p) => p.key === activePreset)?.label})
          </span>
        ) : null}
      </div>

      <CollapsibleContent className="space-y-6 border-t border-border/50 px-3 pb-4 pt-4">
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Live status (today)
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Click a card to filter — click again to clear
            </p>
          </div>
          <TodayLiveStatusFilterCards />
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Punch issues
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Filter by validation issue type
            </p>
          </div>
          {issueCards}
        </section>
      </CollapsibleContent>
    </Collapsible>
  )
}
