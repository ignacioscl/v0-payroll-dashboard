'use client'

import * as React from 'react'
import { ChevronDown, Filter, Search, X } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InvoiceTypeFilter, type InvoiceTypeState } from '@/components/billing/invoice-type-filter'
import { InvoiceAdvancedFilters } from '@/components/billing/invoice-advanced-filters'
import {
  EMPTY_ADVANCED_FILTERS,
  type InvoiceAdvancedFilterState,
  woNumbersToInput,
} from '@/lib/invoice-advanced-filters'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

const STORAGE_KEY = 'invoice-filters-open'

type TriState = 'all' | '1' | '0'

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

const ALL_TYPES: InvoiceTypeState = { wo: true, ttk: true, generic: true }

function typesDifferFromDefault(types: InvoiceTypeState): boolean {
  return !types.wo || !types.ttk || !types.generic
}

/**
 * Collapsible filter deck — types, search, payment/sent, hide $0 invoices.
 */
export function InvoiceFilterDeck({
  types,
  onTypesChange,
  searchInput,
  onSearchChange,
  payed,
  onPayedChange,
  sended,
  onSendedChange,
  hideZero,
  onHideZeroChange,
  advanced,
  onAdvancedChange,
  idDealer,
  disabled,
}: {
  types: InvoiceTypeState
  onTypesChange: (next: InvoiceTypeState) => void
  searchInput: string
  onSearchChange: (value: string) => void
  payed: TriState
  onPayedChange: (value: TriState) => void
  sended: TriState
  onSendedChange: (value: TriState) => void
  /** When true (default), exclude $0 invoices from the list. */
  hideZero: boolean
  onHideZeroChange: (value: boolean) => void
  advanced: InvoiceAdvancedFilterState
  onAdvancedChange: (next: InvoiceAdvancedFilterState) => void
  idDealer: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  /** Closed by default; sessionStorage can reopen after the user expands it. */
  const [open, setOpen] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)
  const prevActiveKeyRef = React.useRef('')

  const chips = React.useMemo((): FilterChip[] => {
    const list: FilterChip[] = []

    if (searchInput.trim()) {
      list.push({
        key: 'search',
        label: t('invoices.filterInvoiceChip', { value: searchInput.trim() }),
        onRemove: () => onSearchChange(''),
      })
    }

    if (typesDifferFromDefault(types)) {
      const parts: string[] = []
      if (types.wo) parts.push(t('invoices.typeWo'))
      if (types.ttk) parts.push(t('invoices.typeTtk'))
      if (types.generic) parts.push(t('invoices.typeGeneric'))
      list.push({
        key: 'types',
        label: parts.join(', '),
        onRemove: () => onTypesChange(ALL_TYPES),
      })
    }

    if (payed === '1') {
      list.push({
        key: 'payed',
        label: t('invoices.paymentPaid'),
        onRemove: () => onPayedChange('0'),
      })
    } else if (payed === 'all') {
      list.push({
        key: 'payed',
        label: t('invoices.paymentAll'),
        onRemove: () => onPayedChange('0'),
      })
    }

    if (sended !== 'all') {
      list.push({
        key: 'sended',
        label: sended === '1' ? t('invoices.sentYes') : t('invoices.sentNo'),
        onRemove: () => onSendedChange('all'),
      })
    }

    if (!hideZero) {
      list.push({
        key: 'zero',
        label: t('invoices.includeZeroInvoices'),
        onRemove: () => onHideZeroChange(true),
      })
    }

    if (advanced.departmentIds.length) {
      list.push({
        key: 'dept',
        label: t('invoices.filterDepartmentChip', { count: advanced.departmentIds.length }),
        onRemove: () => onAdvancedChange({ ...advanced, departmentIds: [], serviceIds: [] }),
      })
    }

    if (advanced.serviceIds.length) {
      list.push({
        key: 'svc',
        label: t('invoices.filterServiceChip', { count: advanced.serviceIds.length }),
        onRemove: () => onAdvancedChange({ ...advanced, serviceIds: [] }),
      })
    }

    if (advanced.woNumbers.length) {
      list.push({
        key: 'wo',
        label: t('invoices.filterWoChip', { value: woNumbersToInput(advanced.woNumbers) }),
        onRemove: () => onAdvancedChange({ ...advanced, woNumbers: [] }),
      })
    }

    if (advanced.roPo.trim()) {
      list.push({
        key: 'ropo',
        label: t('invoices.filterRoPoChip', { value: advanced.roPo.trim() }),
        onRemove: () => onAdvancedChange({ ...advanced, roPo: '' }),
      })
    }

    if (advanced.stock.trim()) {
      list.push({
        key: 'stock',
        label: t('invoices.filterStockChip', { value: advanced.stock.trim() }),
        onRemove: () => onAdvancedChange({ ...advanced, stock: '' }),
      })
    }

    if (advanced.checkDate) {
      list.push({
        key: 'checkDate',
        label: t('invoices.filterCheckDateChip'),
        onRemove: () => onAdvancedChange({ ...advanced, checkDate: undefined }),
      })
    }

    if (advanced.checkNumber.trim()) {
      list.push({
        key: 'checkNum',
        label: t('invoices.filterCheckNumberChip', { value: advanced.checkNumber.trim() }),
        onRemove: () => onAdvancedChange({ ...advanced, checkNumber: '' }),
      })
    }

    if (advanced.authorIds.length) {
      list.push({
        key: 'authors',
        label: advanced.authorsExclude
          ? t('invoices.filterAuthorsExcludeChip', { count: advanced.authorIds.length })
          : t('invoices.filterAuthorsChip', { count: advanced.authorIds.length }),
        onRemove: () =>
          onAdvancedChange({
            ...advanced,
            authorIds: [],
            authorsExclude: false,
            employeeId: null,
            employeeLabel: null,
          }),
      })
    }

    if (advanced.createdBySystem) {
      list.push({
        key: 'system',
        label: t('invoices.filterCreatedBySystemChip'),
        onRemove: () => onAdvancedChange({ ...advanced, createdBySystem: false }),
      })
    }

    if (advanced.exactMatch) {
      list.push({
        key: 'exact',
        label: t('invoices.filterExactMatch'),
        onRemove: () => onAdvancedChange({ ...advanced, exactMatch: false }),
      })
    }

    // District has no chip: the combo lives in the header next to the dealer filter
    // and shows its own selection.

    if (advanced.employeeId != null) {
      list.push({
        key: 'emp',
        label: advanced.employeeLabel ?? t('invoices.filterEmployeeLabel'),
        onRemove: () =>
          onAdvancedChange({ ...advanced, employeeId: null, employeeLabel: null }),
      })
    }

    if (advanced.overdue) {
      list.push({
        key: 'overdue',
        label: t('invoices.filterOverdueLabel'),
        onRemove: () => onAdvancedChange({ ...advanced, overdue: false }),
      })
    }

    if (advanced.showDeleted) {
      list.push({
        key: 'deleted',
        label: t('invoices.filterShowDeletedLabel'),
        onRemove: () => onAdvancedChange({ ...advanced, showDeleted: false }),
      })
    }

    return list
  }, [
    searchInput,
    types,
    payed,
    sended,
    hideZero,
    advanced,
    onSearchChange,
    onTypesChange,
    onPayedChange,
    onSendedChange,
    onHideZeroChange,
    onAdvancedChange,
    t,
  ])

  const activeKey = chips.map((c) => c.key).join('|')
  const hasClearableFilters = chips.some((c) => c.onRemove)

  const clearAllFilters = React.useCallback(() => {
    onSearchChange('')
    onTypesChange(ALL_TYPES)
    onPayedChange('0')
    onSendedChange('all')
    onHideZeroChange(true)
    onAdvancedChange(EMPTY_ADVANCED_FILTERS)
  }, [
    onSearchChange,
    onTypesChange,
    onPayedChange,
    onSendedChange,
    onHideZeroChange,
    onAdvancedChange,
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
      className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors',
            'hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent dark:text-accent">
            <Filter className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-foreground">{t('invoices.filterPanelTitle')}</span>

          <span className="flex-1" />

          {chips.length > 0 ? (
            <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent dark:text-accent">
              {t('invoices.filtersActive', { count: chips.length })}
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

      <CollapsibleContent className="border-t border-border">
        <Card className="gap-0 rounded-none border-0 py-0 shadow-none">
          <div className="flex flex-col gap-4 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <InvoiceTypeFilter value={types} onChange={onTypesChange} disabled={disabled} />

              <Separator orientation="vertical" className="hidden h-8 lg:block" />

              <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3 lg:justify-end">
                <div className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:max-w-xs">
                  <Label htmlFor="invoice-nro-search" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('invoices.filterInvoiceLabel')}
                  </Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="invoice-nro-search"
                      value={searchInput}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder={t('invoices.filterInvoicePlaceholder')}
                      className="h-8 pl-8 text-xs"
                      disabled={disabled}
                    />
                  </div>
                </div>

                <Select
                  value={payed}
                  onValueChange={(v) => onPayedChange(v as TriState)}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className="h-8 w-[130px] text-xs"
                    aria-label={t('invoices.paymentLabel')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('invoices.paymentAll')}</SelectItem>
                    <SelectItem value="1">{t('invoices.paymentPaid')}</SelectItem>
                    <SelectItem value="0">{t('invoices.paymentUnpaid')}</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={sended}
                  onValueChange={(v) => onSendedChange(v as TriState)}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className="h-8 w-[130px] text-xs"
                    aria-label={t('invoices.sentLabel')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('invoices.sentAll')}</SelectItem>
                    <SelectItem value="1">{t('invoices.sentYes')}</SelectItem>
                    <SelectItem value="0">{t('invoices.sentNo')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Switch
                id="invoice-hide-zero"
                checked={hideZero}
                onCheckedChange={onHideZeroChange}
                disabled={disabled}
              />
              <Label htmlFor="invoice-hide-zero" className="cursor-pointer text-sm font-normal">
                {t('invoices.hideZeroInvoices')}
              </Label>
            </div>

            <InvoiceAdvancedFilters
              value={advanced}
              onChange={onAdvancedChange}
              idDealer={idDealer}
              disabled={disabled}
              invoiceSearch={searchInput}
              onInvoiceSearchChange={onSearchChange}
            />
          </div>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  )
}
