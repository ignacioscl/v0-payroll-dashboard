'use client'

import * as React from 'react'
import { ChevronDown, Filter, Lock, Search, X } from 'lucide-react'

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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InvoiceTypeFilter, type InvoiceTypeState } from '@/components/billing/invoice-type-filter'
import { InvoiceAdvancedFilters } from '@/components/billing/invoice-advanced-filters'
import { InvoiceDeletedFilter } from '@/components/billing/invoice-deleted-filter'
import { LookupMultiSelect } from '@/components/billing/lookup-multi-select'
import { useInvoiceWorkerLookup } from '@/hooks/use-invoice-lookups'
import {
  EMPTY_ADVANCED_FILTERS,
  type InvoiceAdvancedFilterState,
  woNumbersToInput,
} from '@/lib/invoice-advanced-filters'
import { type InvoiceDeletedMode } from '@/lib/invoice-search-lock'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

const STORAGE_KEY = 'invoice-filters-open'

type TriState = 'all' | '1' | '0'

type FilterChip = {
  key: string
  label: string
  onRemove?: () => void
  locked?: boolean
}

function FilterChipBadge({ chip, clearLabel }: { chip: FilterChip; clearLabel: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-[11px] font-medium',
        chip.locked
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
          : 'border-border bg-background text-foreground',
        chip.onRemove && 'pr-1.5',
      )}
    >
      {chip.locked ? <Lock className="size-2.5 shrink-0" aria-hidden /> : null}
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

const FILTER_FIELD_LABEL =
  'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'

function typesDifferFromDefault(types: InvoiceTypeState): boolean {
  return !types.wo || !types.ttk || !types.generic
}

function LockableSwitchRow({
  id,
  checked,
  onCheckedChange,
  disabled,
  locked,
  label,
  tooltip,
}: {
  id: string
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  locked?: boolean
  label: string
  tooltip: string
}) {
  const frozen = Boolean(disabled || locked)
  const row = (
    <div className={cn('flex items-center gap-3', locked && 'opacity-70')}>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={frozen}
      />
      <Label
        htmlFor={id}
        className={cn('inline-flex items-center gap-1.5 text-sm font-normal', frozen ? 'cursor-not-allowed' : 'cursor-pointer')}
      >
        {locked ? <Lock className="size-3.5 shrink-0" aria-hidden /> : null}
        {label}
      </Label>
    </div>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{row}</span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
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
  ignorePeriod,
  onIgnorePeriodChange,
  deleted,
  onDeletedChange,
  employeeWorkedIds,
  onEmployeeWorkedChange,
  searchLock,
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
  ignorePeriod: boolean
  onIgnorePeriodChange: (value: boolean) => void
  deleted: InvoiceDeletedMode
  onDeletedChange: (value: InvoiceDeletedMode) => void
  employeeWorkedIds: number[]
  onEmployeeWorkedChange: (next: number[]) => void
  searchLock: boolean
  advanced: InvoiceAdvancedFilterState
  onAdvancedChange: (next: InvoiceAdvancedFilterState) => void
  idDealer: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)
  const prevActiveKeyRef = React.useRef('')
  const [workerOpen, setWorkerOpen] = React.useState(false)
  const [workerSearch, setWorkerSearch] = React.useState('')

  const showEmployeeWorked = types.ttk || types.generic
  const workerQuery = useInvoiceWorkerLookup(
    idDealer,
    workerSearch,
    workerOpen && showEmployeeWorked,
  )

  const effectiveIgnorePeriod = searchLock || ignorePeriod
  const effectiveHideZero = searchLock ? false : hideZero

  const chips = React.useMemo((): FilterChip[] => {
    const list: FilterChip[] = []

    if (searchInput.trim()) {
      list.push({
        key: 'search',
        label: t('invoices.filterInvoiceChip', { value: searchInput.trim() }),
        onRemove: () => onSearchChange(''),
      })
    }

    if (employeeWorkedIds.length) {
      const one =
        employeeWorkedIds.length === 1
          ? (workerQuery.data ?? []).find((o) => o.id === employeeWorkedIds[0])?.label
          : undefined
      list.push({
        key: 'worked',
        label: t('invoices.filterEmployeeWorkedChip', {
          value: one ?? t('invoices.filterManySelected', { count: employeeWorkedIds.length }),
        }),
        onRemove: () => onEmployeeWorkedChange([]),
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
      // Mientras se busca por número queda trabado, igual que fechas y $0: el hint promete
      // "pagas e impagas" y sacar el chip volvería a Impagas, escondiendo la que se busca.
      list.push({
        key: 'payed',
        label: t('invoices.paymentAll'),
        locked: searchLock,
        onRemove: searchLock ? undefined : () => onPayedChange('0'),
      })
    }

    if (sended !== 'all') {
      list.push({
        key: 'sended',
        label: sended === '1' ? t('invoices.sentYes') : t('invoices.sentNo'),
        onRemove: () => onSendedChange('all'),
      })
    }

    if (!effectiveHideZero) {
      list.push({
        key: 'zero',
        label: t('invoices.includeZeroInvoices'),
        locked: searchLock,
        onRemove: searchLock ? undefined : () => onHideZeroChange(true),
      })
    }

    if (effectiveIgnorePeriod) {
      list.push({
        key: 'dates',
        label: t('invoices.filterIgnoreDatesChip'),
        locked: searchLock,
        onRemove: searchLock ? undefined : () => onIgnorePeriodChange(false),
      })
    }

    if (deleted === 'only') {
      list.push({
        key: 'deleted',
        label: t('invoices.filterDeletedOnlyChip'),
        onRemove: () => onDeletedChange('hide'),
      })
    } else if (deleted === 'all') {
      list.push({
        key: 'deleted',
        label: t('invoices.filterDeletedAllChip'),
        onRemove: () => onDeletedChange('hide'),
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

    if (advanced.employeeId != null) {
      list.push({
        key: 'emp',
        label: advanced.employeeLabel ?? t('invoices.filterCreatedByLabel'),
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

    return list
  }, [
    searchInput,
    employeeWorkedIds,
    workerQuery.data,
    types,
    payed,
    sended,
    effectiveHideZero,
    effectiveIgnorePeriod,
    deleted,
    searchLock,
    advanced,
    onSearchChange,
    onEmployeeWorkedChange,
    onTypesChange,
    onPayedChange,
    onSendedChange,
    onHideZeroChange,
    onIgnorePeriodChange,
    onDeletedChange,
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
    onIgnorePeriodChange(false)
    onDeletedChange('hide')
    onEmployeeWorkedChange([])
    onAdvancedChange(EMPTY_ADVANCED_FILTERS)
  }, [
    onSearchChange,
    onTypesChange,
    onPayedChange,
    onSendedChange,
    onHideZeroChange,
    onIgnorePeriodChange,
    onDeletedChange,
    onEmployeeWorkedChange,
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
            'flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-left transition-colors',
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
          {/* Container query: los cortes de adentro miden el ancho de ESTE panel, no el de
              la pantalla. Con el menú lateral abierto la ventana puede ser ancha y el panel
              angosto, y ahí un breakpoint de viewport se equivoca. */}
          <div className="@container/deck flex flex-col gap-4 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:gap-4">
              <div className="flex shrink-0 flex-col gap-1">
                <Label className={FILTER_FIELD_LABEL}>{t('invoices.typesLabel')}</Label>
                <InvoiceTypeFilter value={types} onChange={onTypesChange} disabled={disabled} />
              </div>

              <Separator orientation="vertical" className="hidden h-8 self-end xl:block" />

              {/* Dos subgrupos en vez de un flex-wrap suelto: los campos de texto y los
                  dos selects bajan como bloque y arrancan alineados a la izquierda. Con
                  flex-wrap + justify-end, "Sent" caía solo a una segunda línea pegado a la
                  derecha, con un hueco al lado. */}
              <div className="flex min-w-0 flex-1 flex-col gap-3 xl:flex-row xl:items-end xl:justify-end">
                {/* Invoice # y Employee: uno debajo del otro cuando el panel baja de 530px,
                    que es donde los dos juntos dejan de entrar. Los demás campos no. */}
                <div className="flex min-w-0 flex-1 flex-col gap-3 @[530px]/deck:flex-row @[530px]/deck:items-end">
                <div className="flex min-w-0 flex-1 flex-col gap-1 xl:max-w-xs">
                  <Label htmlFor="invoice-nro-search" className={FILTER_FIELD_LABEL}>
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

                {showEmployeeWorked ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1 xl:max-w-xs">
                    <Label className={FILTER_FIELD_LABEL}>
                      {t('invoices.filterEmployeeWorkedLabel')}
                    </Label>
                    <LookupMultiSelect
                      options={workerQuery.data ?? []}
                      value={employeeWorkedIds}
                      onChange={onEmployeeWorkedChange}
                      onSearchChange={setWorkerSearch}
                      onOpenChange={setWorkerOpen}
                      placeholder={t('invoices.filterEmployeeWorkedPlaceholder')}
                      loading={workerQuery.isFetching}
                      disabled={disabled}
                      withPhotos
                    />
                  </div>
                ) : null}
                </div>

                {/* Los dos selects: reparten el ancho por igual cuando bajan de línea,
                    y vuelven a 130px fijos cuando entran todos en una fila. */}
                <div className="flex items-end gap-3 xl:shrink-0">
                <div className="flex flex-1 flex-col gap-1 xl:w-[130px] xl:flex-none">
                  <Label htmlFor="invoice-payed-filter" className={FILTER_FIELD_LABEL}>
                    {t('invoices.paymentLabel')}
                  </Label>
                  <Select
                    value={payed}
                    onValueChange={(v) => onPayedChange(v as TriState)}
                    disabled={disabled || searchLock}
                  >
                    <SelectTrigger
                      id="invoice-payed-filter"
                      size="sm"
                      className="h-8 w-full text-xs"
                      title={searchLock ? t('invoices.filterSearchLockHint') : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('invoices.paymentAll')}</SelectItem>
                      <SelectItem value="1">{t('invoices.paymentPaid')}</SelectItem>
                      <SelectItem value="0">{t('invoices.paymentUnpaid')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-1 flex-col gap-1 xl:w-[130px] xl:flex-none">
                  <Label htmlFor="invoice-sended-filter" className={FILTER_FIELD_LABEL}>
                    {t('invoices.sentLabel')}
                  </Label>
                  <Select
                    value={sended}
                    onValueChange={(v) => onSendedChange(v as TriState)}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      id="invoice-sended-filter"
                      size="sm"
                      className="h-8 w-full text-xs"
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
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-3"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <LockableSwitchRow
                id="invoice-hide-zero"
                checked={effectiveHideZero}
                onCheckedChange={onHideZeroChange}
                disabled={disabled}
                locked={searchLock}
                label={t('invoices.hideZeroInvoices')}
                tooltip={
                  searchLock
                    ? t('invoices.filterSearchLockHint')
                    : t('invoices.hideZeroInvoices')
                }
              />
              <LockableSwitchRow
                id="invoice-ignore-period"
                checked={effectiveIgnorePeriod}
                onCheckedChange={onIgnorePeriodChange}
                disabled={disabled}
                locked={searchLock}
                label={t('invoices.filterIgnoreDatesLabel')}
                tooltip={
                  searchLock
                    ? t('invoices.filterIgnoreDatesForced')
                    : t('invoices.filterIgnoreDatesTooltip')
                }
              />
              <InvoiceDeletedFilter
                value={deleted}
                onChange={onDeletedChange}
                disabled={disabled}
              />
            </div>

            {searchLock ? (
              <p className="text-[11px] text-amber-800 dark:text-amber-200">
                {t('invoices.filterSearchLockHint')}
              </p>
            ) : null}

            <InvoiceAdvancedFilters
              value={advanced}
              onChange={onAdvancedChange}
              idDealer={idDealer}
              disabled={disabled}
            />
          </div>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  )
}
