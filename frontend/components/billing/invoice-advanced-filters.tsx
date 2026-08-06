'use client'

import * as React from 'react'

import { DatePicker } from '@/components/filters/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LookupMultiSelect } from '@/components/billing/lookup-multi-select'
import { WoNumberFilter } from '@/components/billing/wo-number-filter'
import {
  useInvoiceAuthorLookup,
  useInvoiceDepartmentLookup,
  useInvoiceServiceLookup,
} from '@/hooks/use-invoice-lookups'
import type { InvoiceAdvancedFilterState } from '@/lib/invoice-advanced-filters'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function FilterLane({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3 border-l-2 border-accent/30 pl-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent/80 dark:text-accent/80">
        {title}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export function InvoiceAdvancedFilters({
  value,
  onChange,
  idDealer,
  disabled,
  invoiceSearch,
  onInvoiceSearchChange,
}: {
  value: InvoiceAdvancedFilterState
  onChange: (next: InvoiceAdvancedFilterState) => void
  idDealer: string
  disabled?: boolean
  /** Invoice statement # (INVOICE_STATEMENT.full_nro). */
  invoiceSearch?: string
  onInvoiceSearchChange?: (value: string) => void
}) {
  const { t } = useTranslation()
  const [deptOpen, setDeptOpen] = React.useState(false)
  const [svcOpen, setSvcOpen] = React.useState(false)
  const [authorOpen, setAuthorOpen] = React.useState(false)
  const [deptSearch, setDeptSearch] = React.useState('')
  const [svcSearch, setSvcSearch] = React.useState('')
  const [authorSearch, setAuthorSearch] = React.useState('')

  const deptQuery = useInvoiceDepartmentLookup(idDealer, deptSearch, deptOpen)
  const svcQuery = useInvoiceServiceLookup(
    idDealer,
    value.departmentIds,
    svcSearch,
    svcOpen,
  )
  const authorQuery = useInvoiceAuthorLookup(idDealer, authorSearch, authorOpen)

  const patch = (partial: Partial<InvoiceAdvancedFilterState>) => {
    onChange({ ...value, ...partial })
  }

  return (
    <div className="space-y-4 border-t border-border/60 pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{t('invoices.advancedFiltersTitle')}</p>
        <p className="text-[11px] text-muted-foreground">{t('invoices.advancedFiltersHint')}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <FilterLane title={t('invoices.filterLaneWorkOrder')}>
          <FilterField label={t('invoices.filterInvoiceLabel')} htmlFor="inv-filter-invoice" className="sm:col-span-2">
            <Input
              id="inv-filter-invoice"
              value={invoiceSearch ?? ''}
              onChange={(e) => onInvoiceSearchChange?.(e.target.value)}
              placeholder={t('invoices.filterInvoicePlaceholder')}
              className="h-8 text-xs"
              disabled={disabled || !onInvoiceSearchChange}
            />
          </FilterField>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Label htmlFor="inv-exact-match" className="text-xs text-muted-foreground">
              {t('invoices.filterExactMatch')}
            </Label>
            <Switch
              id="inv-exact-match"
              checked={value.exactMatch}
              onCheckedChange={(exactMatch) => patch({ exactMatch })}
              disabled={disabled}
            />
          </div>
          <FilterField label={t('invoices.filterWoLabel')} className="sm:col-span-2">
            <WoNumberFilter
              value={value.woNumbers}
              onChange={(woNumbers) => patch({ woNumbers })}
              disabled={disabled}
            />
          </FilterField>
          <FilterField label={t('invoices.filterRoPoLabel')} htmlFor="inv-filter-ropo">
            <Input
              id="inv-filter-ropo"
              value={value.roPo}
              onChange={(e) => patch({ roPo: e.target.value })}
              placeholder={t('invoices.filterRoPoPlaceholder')}
              className="h-8 text-xs"
              disabled={disabled}
            />
          </FilterField>
          <FilterField label={t('invoices.filterStockLabel')} htmlFor="inv-filter-stock">
            <Input
              id="inv-filter-stock"
              value={value.stock}
              onChange={(e) => patch({ stock: e.target.value })}
              placeholder={t('invoices.filterStockPlaceholder')}
              className="h-8 text-xs"
              disabled={disabled}
            />
          </FilterField>
        </FilterLane>

        <FilterLane title={t('invoices.filterLaneOrganization')}>
          {/* District lives in the header, left of the dealer combo (legacy layout). */}
          <FilterField label={t('invoices.filterDepartmentLabel')}>
            <LookupMultiSelect
              options={deptQuery.data ?? []}
              value={value.departmentIds}
              onChange={(departmentIds) =>
                patch({
                  departmentIds,
                  serviceIds: [],
                })
              }
              onSearchChange={setDeptSearch}
              onOpenChange={setDeptOpen}
              placeholder={t('invoices.filterDepartmentPlaceholder')}
              loading={deptQuery.isFetching}
              disabled={disabled}
            />
          </FilterField>
          <FilterField label={t('invoices.filterServiceLabel')}>
            <LookupMultiSelect
              options={svcQuery.data ?? []}
              value={value.serviceIds}
              onChange={(serviceIds) => patch({ serviceIds })}
              onSearchChange={setSvcSearch}
              onOpenChange={setSvcOpen}
              placeholder={t('invoices.filterServicePlaceholder')}
              loading={svcQuery.isFetching}
              disabled={disabled}
            />
          </FilterField>
          <FilterField label={t('invoices.filterEmployeeLabel')} className="sm:col-span-2">
            <LookupMultiSelect
              options={authorQuery.data ?? []}
              value={value.authorIds}
              onChange={(authorIds) =>
                patch({
                  authorIds,
                  authorsExclude: authorIds.length === 0 ? false : value.authorsExclude,
                  employeeId: null,
                  employeeLabel: null,
                })
              }
              onSearchChange={setAuthorSearch}
              onOpenChange={setAuthorOpen}
              placeholder={t('invoices.filterEmployeePlaceholder')}
              loading={authorQuery.isFetching}
              disabled={disabled}
            />
          </FilterField>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Label htmlFor="inv-authors-exclude" className="text-xs text-muted-foreground">
              {t('invoices.filterAuthorsExclude')}
            </Label>
            <Switch
              id="inv-authors-exclude"
              checked={value.authorsExclude}
              onCheckedChange={(authorsExclude) => patch({ authorsExclude })}
              disabled={disabled || value.authorIds.length === 0}
            />
          </div>
          {/* Batch/cron statements have no employee author, so they can only be
              reached with this toggle — the combo above lists employees only. */}
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Label htmlFor="inv-created-by-system" className="text-xs text-muted-foreground">
              {t('invoices.filterCreatedBySystem')}
            </Label>
            <Switch
              id="inv-created-by-system"
              checked={value.createdBySystem}
              onCheckedChange={(createdBySystem) => patch({ createdBySystem })}
              disabled={disabled}
            />
          </div>
        </FilterLane>

        <FilterLane title={t('invoices.filterLaneStatus')}>
          <FilterField label={t('invoices.filterCheckDateLabel')}>
            <DatePicker
              value={value.checkDate}
              onChange={(checkDate) => patch({ checkDate })}
              placeholder={t('invoices.filterCheckDatePlaceholder')}
              className="h-8 w-full min-w-0 text-xs"
              disabled={disabled}
            />
          </FilterField>
          <FilterField label={t('invoices.filterCheckNumberLabel')} htmlFor="inv-filter-check-num">
            <Input
              id="inv-filter-check-num"
              value={value.checkNumber}
              onChange={(e) => patch({ checkNumber: e.target.value })}
              placeholder={t('invoices.filterCheckNumberPlaceholder')}
              className="h-8 text-xs tabular-nums"
              disabled={disabled}
            />
          </FilterField>
          <div className="flex flex-col justify-end gap-3 sm:col-span-2">
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
              <Switch
                id="inv-filter-overdue"
                checked={value.overdue}
                onCheckedChange={(overdue) => patch({ overdue })}
                disabled={disabled}
              />
              <Label htmlFor="inv-filter-overdue" className="cursor-pointer text-sm font-normal">
                {t('invoices.filterOverdueLabel')}
              </Label>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
              <Switch
                id="inv-filter-deleted"
                checked={value.showDeleted}
                onCheckedChange={(showDeleted) => patch({ showDeleted })}
                disabled={disabled}
              />
              <Label htmlFor="inv-filter-deleted" className="cursor-pointer text-sm font-normal">
                {t('invoices.filterShowDeletedLabel')}
              </Label>
            </div>
          </div>
        </FilterLane>
      </div>
    </div>
  )
}
