'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { ChevronDown, Filter, X } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFilters } from '@/lib/filter-context'
import {
  getDefaultDateRange,
  matchPreset,
} from '@/lib/filters/date-range-presets'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  getIssueFilterLabel,
  getDateRangePresets,
  todayLiveStatusLabelTranslated,
} from '@/lib/i18n/label-helpers'
import {
  PAYMENT_TYPE_FILTER_ALL,
  PAYMENT_TYPE_FILTER_WITHOUT,
  type PaymentTypeFilterValue,
} from '@/lib/ttk/payment-type-filter'
import type { PaymentTypeCatalogItem } from '@/lib/ttk/payment-type-filter'
import { TodayLiveStatusFilterCards } from '@/components/ttk/today-live-status-filter-cards'
import { PunchHoursFilter } from '@/components/ttk/punch-hours-filter'
import { PaymentTypeFilter } from '@/components/ttk/payment-type-filter'

const STORAGE_KEY = 'punch-report-filters-open'

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
  todayLabel: string,
): string | null {
  if (!from) return null
  const end = to ?? from
  const today = new Date()
  if (sameDay(from, end) && sameDay(from, today)) return todayLabel
  if (sameDay(from, end)) return format(from, 'MMM d, yyyy')
  return `${format(from, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

type FilterChip = {
  key: string
  label: string
  onRemove?: () => void
}

function FilterChipBadge({ chip, clearLabel }: { chip: FilterChip; clearLabel: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1',
        'text-[11px] font-medium text-foreground',
        chip.onRemove && 'pr-1.5',
      )}
    >
      {chip.label}
      {chip.onRemove ? (
        <button
          type="button"
          className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`${clearLabel} ${chip.label}`}
          onClick={chip.onRemove}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </span>
  )
}

export type PunchReportFilterPanelProps = {
  punchMinHours: string
  punchMaxHours: string
  onPunchMinHoursChange: (v: string) => void
  onPunchMaxHoursChange: (v: string) => void
  paymentTypeFilter: PaymentTypeFilterValue
  onPaymentTypeFilterChange: (v: PaymentTypeFilterValue) => void
  paymentTypeOptions: PaymentTypeCatalogItem[]
  showPaymentTypeFilter?: boolean
  paymentTypesLoading?: boolean
  /** When null/undefined, hide “Filter by issue type” (e.g. external companies). */
  issueCards?: React.ReactNode | null
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
  showPaymentTypeFilter = false,
  paymentTypesLoading = false,
  issueCards,
  className,
}: PunchReportFilterPanelProps) {
  const { t } = useTranslation()
  const dateRangePresets = React.useMemo(() => getDateRangePresets(t), [t])
  const {
    search,
    setSearch,
    selectedEmployee,
    setSelectedEmployee,
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
    if (paymentTypeFilter === PAYMENT_TYPE_FILTER_WITHOUT) return t('punch.withoutPaymentType')
    const opt = paymentTypeOptions.find((o) => o.id === paymentTypeFilter)
    return opt?.name ?? opt?.title ?? t('punch.paymentTypeChip', { id: paymentTypeFilter })
  }, [paymentTypeFilter, paymentTypeOptions, t])

  const chips = React.useMemo((): FilterChip[] => {
    const list: FilterChip[] = []

    const dateLabel = formatDateRangeLabel(dateRange?.from, dateRange?.to, t('common.today'))
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
        label: t('punch.searchChip', { query: search.trim() }),
        onRemove: () => setSearch(''),
      })
    }

    if (selectedEmployee) {
      list.push({
        key: 'employee',
        label: t('punch.employeeChip', { name: selectedEmployee.nombre }),
        onRemove: () => setSelectedEmployee(null),
      })
    }

    if (selectedDealers.length > 0) {
      list.push({
        key: 'dealers',
        label:
          selectedDealers.length === 1
            ? t('dealer.oneSelected')
            : t('dealer.manySelected', { count: selectedDealers.length }),
      })
    }

    if (selectedType && selectedType !== 'all') {
      list.push({
        key: 'issue',
        label: getIssueFilterLabel(t, selectedType),
        onRemove: () => setSelectedType('all'),
      })
    }

    if (selectedTodayLiveStatus !== TODAY_LIVE_STATUS_ALL) {
      list.push({
        key: 'live',
        label: todayLiveStatusLabelTranslated(t, selectedTodayLiveStatus),
        onRemove: () => setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL),
      })
    }

    if (punchMinHours.trim()) {
      list.push({
        key: 'min-hours',
        label: t('punch.moreThanHours', { hours: punchMinHours }),
        onRemove: () => onPunchMinHoursChange(''),
      })
    }

    if (punchMaxHours.trim()) {
      list.push({
        key: 'max-hours',
        label: t('punch.lessThanHours', { hours: punchMaxHours }),
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
    selectedEmployee,
    selectedDealers.length,
    selectedType,
    selectedTodayLiveStatus,
    punchMinHours,
    punchMaxHours,
    paymentTypeLabel,
    setDateRange,
    setSearch,
    setSelectedEmployee,
    setSelectedType,
    setSelectedTodayLiveStatus,
    onPunchMinHoursChange,
    onPunchMaxHoursChange,
    onPaymentTypeFilterChange,
    t,
  ])

  const activeKey = chips.map((c) => c.key).join('|')
  const hasClearableFilters = chips.some((c) => c.onRemove)

  const clearAllFilters = React.useCallback(() => {
    setSearch('')
    setSelectedEmployee(null)
    setSelectedType('all')
    setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    setDateRange(getDefaultDateRange())
    onPunchMinHoursChange('')
    onPunchMaxHoursChange('')
    onPaymentTypeFilterChange(PAYMENT_TYPE_FILTER_ALL)
  }, [
    setSearch,
    setSelectedEmployee,
    setSelectedType,
    setSelectedTodayLiveStatus,
    setDateRange,
    onPunchMinHoursChange,
    onPunchMaxHoursChange,
    onPaymentTypeFilterChange,
  ])

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
        'overflow-hidden rounded-[14px] border border-border bg-card shadow-sm',
        className,
      )}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors',
            'hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
            <Filter className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-foreground">{t('punch.filterPanelTitle')}</span>

          <span className="flex-1" />

          {chips.length > 0 ? (
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {t('punch.filtersActive', { count: chips.length })}
            </span>
          ) : null}

          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>

      {chips.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {chips.map((chip) => (
            <FilterChipBadge key={chip.key} chip={chip} clearLabel={t('common.clear')} />
          ))}
          {activePreset ? (
            <span className="text-[10px] text-muted-foreground">
              ({dateRangePresets.find((p) => p.key === activePreset)?.label})
            </span>
          ) : null}
          {hasClearableFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 cursor-pointer gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={clearAllFilters}
            >
              <X className="size-3" />
              {t('common.clearAll')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <CollapsibleContent className="border-t border-border px-4 pb-4 pt-4">
        <section className={issueCards ? 'mb-5' : undefined}>
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <h3 className="text-[13px] font-semibold text-foreground">
              {t('punch.liveStatusToday')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t('punch.clickCardToFilter')}
            </p>
          </div>
          <TodayLiveStatusFilterCards />
        </section>

        {issueCards ? (
          <>
            <div className="mb-5 border-t border-border" />

            <section>
              <div className="mb-3 flex flex-wrap items-baseline gap-2">
                <h3 className="text-[13px] font-semibold text-foreground">
                  {t('punch.filterByIssueType')}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {t('punch.clickCardToFilter')}
                </p>
              </div>
              {issueCards}
            </section>
          </>
        ) : null}
      </CollapsibleContent>

      <div
        className="flex flex-wrap items-center gap-4 border-t border-border bg-slate-50/45 px-4 py-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <PunchHoursFilter
          minHours={punchMinHours}
          maxHours={punchMaxHours}
          onMinChange={onPunchMinHoursChange}
          onMaxChange={onPunchMaxHoursChange}
        />
        {showPaymentTypeFilter ? (
          <>
            <div className="hidden h-[18px] w-px bg-border sm:block" />
            <PaymentTypeFilter
              value={paymentTypeFilter}
              onChange={onPaymentTypeFilterChange}
              options={paymentTypeOptions}
              loading={paymentTypesLoading}
            />
          </>
        ) : null}
      </div>
    </Collapsible>
  )
}
