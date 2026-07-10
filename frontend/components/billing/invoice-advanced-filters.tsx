'use client'

import * as React from 'react'

import { DatePicker } from '@/components/filters/date-picker'
import { EmployeeCombobox } from '@/components/ttk/employee-combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LookupMultiSelect } from '@/components/billing/lookup-multi-select'
import { WoNumberFilter } from '@/components/billing/wo-number-filter'
import {
  useInvoiceDepartmentLookup,
  useInvoiceServiceLookup,
} from '@/hooks/use-invoice-lookups'
import { useTtkEmployeeSearch } from '@/hooks/use-ttk-employee-search'
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
    <section className="space-y-3 border-l-2 border-sky-500/30 pl-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-800/80 dark:text-sky-300/80">
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
  primaryDealerId,
  disabled,
}: {
  value: InvoiceAdvancedFilterState
  onChange: (next: InvoiceAdvancedFilterState) => void
  idDealer: string
  /** First selected dealer — employee search requires one dealer scope. */
  primaryDealerId: number | null
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [deptOpen, setDeptOpen] = React.useState(false)
  const [svcOpen, setSvcOpen] = React.useState(false)
  const [deptSearch, setDeptSearch] = React.useState('')
  const [svcSearch, setSvcSearch] = React.useState('')
  const [employeeTerm, setEmployeeTerm] = React.useState('')

  const deptQuery = useInvoiceDepartmentLookup(idDealer, deptSearch, deptOpen)
  const svcQuery = useInvoiceServiceLookup(
    idDealer,
    value.departmentIds,
    svcSearch,
    svcOpen,
  )
  const employeeQuery = useTtkEmployeeSearch(
    employeeTerm,
    primaryDealerId,
    !disabled && primaryDealerId != null,
  )

  const patch = (partial: Partial<InvoiceAdvancedFilterState>) => {
    onChange({ ...value, ...partial })
  }

  const selectedEmployee =
    value.employeeId != null && value.employeeLabel
      ? {
          id: value.employeeId,
          nombre: value.employeeLabel,
        }
      : null

  return (
    <div className="space-y-4 border-t border-border/60 pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{t('invoices.advancedFiltersTitle')}</p>
        <p className="text-[11px] text-muted-foreground">{t('invoices.advancedFiltersHint')}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <FilterLane title={t('invoices.filterLaneWorkOrder')}>
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
            <EmployeeCombobox
              value={selectedEmployee}
              onChange={(emp) =>
                patch({
                  employeeId: emp?.id ?? null,
                  employeeLabel: emp?.nombre ?? null,
                })
              }
              searchTerm={employeeTerm}
              onSearchTermChange={setEmployeeTerm}
              employees={employeeQuery.data}
              isLoading={employeeQuery.isFetching}
              disabled={disabled}
              dealerSelected={primaryDealerId != null}
              compact
              placeholder={t('invoices.filterEmployeePlaceholder')}
            />
          </FilterField>
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
