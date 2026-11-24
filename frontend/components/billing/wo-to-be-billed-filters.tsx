'use client'

import * as React from 'react'

import { FILTER_FIELD_LABEL, FilterPanel, type FilterPanelChip } from '@/components/shared/filter-panel'
import { LookupMultiSelect, type LookupOption } from '@/components/shared/lookup-multi-select'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { SearchInput } from '@/components/shared/search-input'
import { SegmentedControl } from '@/components/shared/segmented-control'
import { FieldMessage } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useInvoiceDepartmentLookup, useInvoiceServiceLookup } from '@/hooks/use-invoice-lookups'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  WO_INVOICE_TYPE_BY_SERVICES,
  WO_INVOICE_TYPE_MULTI_SERVICES,
  WO_INVOICE_TYPE_SELECTED_SERVICES,
  WO_STATUS_IDS,
  type WoApprovedFilter,
  type WoInvoiceType,
} from '@/lib/srs-wo-to-be-billed-api'

/** Lo que la pantalla filtra, tal como lo edita el panel (los textos, sin el debounce). */
export interface WoFilterState {
  invoiceType: WoInvoiceType | null
  departments: number[]
  services: number[]
  showDeletedServices: boolean
  status: number[]
  includeZero: boolean
  approved: WoApprovedFilter
  stock: string
  wo: string
  price: string
  ro: string
  po: string
}

export const EMPTY_WO_FILTERS: WoFilterState = {
  invoiceType: null,
  departments: [],
  services: [],
  showDeletedServices: false,
  status: [],
  includeZero: false,
  approved: '',
  stock: '',
  wo: '',
  price: '',
  ro: '',
  po: '',
}

/** Ids de los campos a los que «Generate Invoice» lleva el foco cuando falta algo (T10). */
export const WO_FILTER_INVOICE_TYPE_ID = 'wo-filter-invoice-type'
export const WO_FILTER_SERVICES_ID = 'wo-filter-services'

const PRICE_RE = /^\d{0,6}(\.\d{0,2})?$/

type Option = { id: number; label: string; sublabel?: string }

/**
 * Panel de filtros de WO to be Billed (plans/plan-wo-to-be-billed-v0, T9), con el `FilterPanel` común y sus chips,
 * como Expenses e Invoices. Con «by Services» / «Multi-Services» (o sin tipo) Department y Services se eligen de a
 * uno, y Services solo después de un Department; con «Selected Services», varios.
 */
export function WoToBeBilledFilters({
  value,
  onChange,
  idDealer,
  disabled,
  open,
  onOpenChange,
  fieldErrors,
}: {
  value: WoFilterState
  onChange: (next: WoFilterState) => void
  /** El dealer de la barra (uno solo); vacío = sin dealer. */
  idDealer: string
  disabled?: boolean
  /** Abierto / cerrado desde la pantalla (T10: «Generate Invoice» lo abre si falta un dato). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Lo que falta para generar (T10): el error va debajo del campo. */
  fieldErrors?: { invoiceType?: string | null; services?: string | null }
}) {
  const { t } = useTranslation()
  const multi = value.invoiceType === WO_INVOICE_TYPE_SELECTED_SERVICES
  const set = (patch: Partial<WoFilterState>) => onChange({ ...value, ...patch })

  const [deptTerm, setDeptTerm] = React.useState('')
  const [svcTerm, setSvcTerm] = React.useState('')
  const [deptOpen, setDeptOpen] = React.useState(false)
  const [svcOpen, setSvcOpen] = React.useState(false)
  const lookupsEnabled = idDealer.length > 0 && !disabled
  const deptQuery = useInvoiceDepartmentLookup(idDealer, deptTerm, lookupsEnabled && (deptOpen || !multi))
  const serviceDepartments = multi ? value.departments : value.departments.slice(0, 1)
  const svcEnabled = lookupsEnabled && (multi || value.departments.length === 1) && (svcOpen || !multi)
  const svcQuery = useInvoiceServiceLookup(
    idDealer,
    serviceDepartments,
    svcTerm,
    svcEnabled,
    multi && value.showDeletedServices,
  )

  // Los nombres de lo elegido, para los chips, aunque la búsqueda actual ya no lo traiga: se guardan al elegir.
  const [labels, setLabels] = React.useState<Record<string, string>>({})
  const remember = (prefix: 'd' | 's', ids: number[], items: Option[]) => {
    const found = items.filter((o) => ids.includes(o.id))
    if (found.length) setLabels((prev) => ({ ...prev, ...Object.fromEntries(found.map((o) => [`${prefix}${o.id}`, o.label])) }))
  }
  const deptLabel = (id: number) =>
    labels[`d${id}`] ?? deptQuery.data?.results.find((o) => o.id === id)?.label ?? `#${id}`
  const svcLabel = (id: number) =>
    labels[`s${id}`] ?? svcQuery.data?.results.find((o) => o.id === id)?.label ?? `#${id}`

  const typeOptions: { value: WoInvoiceType; label: string }[] = [
    { value: WO_INVOICE_TYPE_BY_SERVICES, label: t('woToBeBilled.invoiceTypes.byServices') },
    { value: WO_INVOICE_TYPE_MULTI_SERVICES, label: t('woToBeBilled.invoiceTypes.multiServices') },
    { value: WO_INVOICE_TYPE_SELECTED_SERVICES, label: t('woToBeBilled.invoiceTypes.selectedServices') },
  ]
  const statusLabel: Record<number, string> = {
    15: t('woToBeBilled.status.inTransit'),
    5: t('woToBeBilled.status.arrived'),
    6: t('woToBeBilled.status.inProcess'),
    7: t('woToBeBilled.status.completed'),
    16: t('woToBeBilled.status.pause'),
  }
  const statusOptions: LookupOption[] = WO_STATUS_IDS.map((id) => ({ id, label: statusLabel[id] }))
  const [statusTerm, setStatusTerm] = React.useState('')
  const statusItems = statusOptions.filter((o) => o.label.toLowerCase().includes(statusTerm.trim().toLowerCase()))
  const approvedLabel: Record<WoApprovedFilter, string> = {
    '': t('woToBeBilled.approvedOptions.all'),
    '1': t('woToBeBilled.approvedOptions.yes'),
    '0': t('woToBeBilled.approvedOptions.no'),
  }

  const chips: FilterPanelChip[] = [
    ...(value.invoiceType != null
      ? [
          {
            key: 'type',
            label: typeOptions.find((o) => o.value === value.invoiceType)?.label ?? '',
            // Al limpiar el tipo se limpian department y servicios (legacy los limpia según el tipo).
            onRemove: () => set({ invoiceType: null, departments: [], services: [] }),
          },
        ]
      : []),
    ...value.departments.map((id) => ({
      key: `dept-${id}`,
      label: `${t('woToBeBilled.filters.department')}: ${deptLabel(id)}`,
      // Cambiar el department limpia los servicios, también en «Selected Services» (PLAN.md:956; R10 de CODE-review.md).
      onRemove: () => set({ departments: value.departments.filter((d) => d !== id), services: [] }),
    })),
    ...value.services.map((id) => ({
      key: `svc-${id}`,
      label: `${t('woToBeBilled.filters.services')}: ${svcLabel(id)}`,
      onRemove: () => set({ services: value.services.filter((s) => s !== id) }),
    })),
    ...value.status.map((id) => ({
      key: `status-${id}`,
      label: `${t('woToBeBilled.filters.status')}: ${statusLabel[id]}`,
      onRemove: () => set({ status: value.status.filter((s) => s !== id) }),
    })),
    ...(value.includeZero
      ? [{ key: 'zero', label: t('woToBeBilled.filters.includeZero'), onRemove: () => set({ includeZero: false }) }]
      : []),
    ...(value.approved !== ''
      ? [
          {
            key: 'approved',
            label: `${t('woToBeBilled.filters.approved')}: ${approvedLabel[value.approved]}`,
            onRemove: () => set({ approved: '' }),
          },
        ]
      : []),
    ...(['stock', 'wo', 'price', 'ro', 'po'] as const)
      .filter((key) => value[key].trim())
      .map((key) => ({
        key,
        label: `${t(`woToBeBilled.filters.${key}`)}: ${value[key].trim()}`,
        onRemove: () => set({ [key]: '' } as Partial<WoFilterState>),
      })),
  ]

  const deptItems: Option[] = deptQuery.data?.results ?? []
  const svcItems: Option[] = svcQuery.data?.results ?? []
  const selectedDept = value.departments[0] != null ? { id: value.departments[0], label: deptLabel(value.departments[0]) } : null
  const selectedSvc = value.services[0] != null ? { id: value.services[0], label: svcLabel(value.services[0]) } : null

  const textField = (key: 'stock' | 'wo' | 'price' | 'ro' | 'po', max: number) => (
    <div key={key} className="min-w-0 space-y-1">
      <Label htmlFor={`wo-filter-${key}`} className={FILTER_FIELD_LABEL}>
        {t(`woToBeBilled.filters.${key}`)}
      </Label>
      <SearchInput
        id={`wo-filter-${key}`}
        value={value[key]}
        onValueChange={(next) => {
          if (key === 'price' && !PRICE_RE.test(next)) return
          set({ [key]: next.slice(0, max) } as Partial<WoFilterState>)
        }}
        inputMode={key === 'price' ? 'decimal' : undefined}
        maxLength={max}
        iconClassName="left-2.5 h-3.5 w-3.5"
        inputClassName="h-8 pl-8 text-xs"
        disabled={disabled}
      />
    </div>
  )

  return (
    <FilterPanel
      storageKey="wo-to-be-billed-filters-open"
      chips={chips}
      open={open}
      onOpenChange={onOpenChange}
      // Todo lo que tiene chip vuelve a vacío en una sola actualización (R8); «Show deleted services» no tiene chip.
      onClearAll={() => onChange({ ...EMPTY_WO_FILTERS, showDeletedServices: value.showDeletedServices })}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={WO_FILTER_INVOICE_TYPE_ID} className={FILTER_FIELD_LABEL}>
              {t('woToBeBilled.filters.invoiceType')}
            </Label>
            <Select
              value={value.invoiceType != null ? String(value.invoiceType) : ''}
              onValueChange={(v) =>
                // Al cambiar el tipo se limpian department y servicios (`app.binvoice_main.js:1349-1368`).
                set({ invoiceType: Number(v) as WoInvoiceType, departments: [], services: [] })
              }
              disabled={disabled}
            >
              <SelectTrigger
                id={WO_FILTER_INVOICE_TYPE_ID}
                className="h-8 w-full text-xs"
                aria-invalid={fieldErrors?.invoiceType ? true : undefined}
                aria-describedby={`${WO_FILTER_INVOICE_TYPE_ID}-message`}
              >
                <SelectValue placeholder={t('woToBeBilled.filters.invoiceTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage id={`${WO_FILTER_INVOICE_TYPE_ID}-message`} message={fieldErrors?.invoiceType ?? null} />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className={FILTER_FIELD_LABEL}>{t('woToBeBilled.filters.department')}</Label>
            {multi ? (
              <LookupMultiSelect
                options={deptItems}
                truncated={deptQuery.data?.truncated}
                value={value.departments}
                // Los departments elegidos acotan la lista de servicios.
                onChange={(departments) => {
                  remember('d', departments, deptItems)
                  // Los departments elegidos acotan los servicios: cambiarlos limpia los servicios (R10).
                  set({ departments, services: [] })
                }}
                onSearchChange={setDeptTerm}
                onOpenChange={setDeptOpen}
                loading={deptQuery.isFetching}
                disabled={disabled || !idDealer}
              />
            ) : (
              <SearchableCombobox<Option>
                value={selectedDept}
                // Al cambiar el department se limpian los servicios (`invoice-advanced-filters.tsx:159-194`).
                onChange={(next) => {
                  if (next) remember('d', [next.id], [next])
                  set({ departments: next ? [next.id] : [], services: [] })
                }}
                searchTerm={deptTerm}
                onSearchTermChange={setDeptTerm}
                items={deptItems}
                serverSideSearch
                isLoading={deptQuery.isFetching}
                getItemKey={(o) => o.id}
                getItemLabel={(o) => o.label}
                placeholder={t('woToBeBilled.filters.department')}
                searchPlaceholder={t('woToBeBilled.filters.department')}
                showFooterHint={false}
                disabled={disabled || !idDealer}
                compact
              />
            )}
          </div>

          <div className="min-w-0 space-y-1" id={WO_FILTER_SERVICES_ID} tabIndex={-1}>
            <Label className={FILTER_FIELD_LABEL}>{t('woToBeBilled.filters.services')}</Label>
            {multi ? (
              <LookupMultiSelect
                options={svcItems}
                truncated={svcQuery.data?.truncated}
                value={value.services}
                onChange={(services) => {
                  remember('s', services, svcItems)
                  set({ services })
                }}
                onSearchChange={setSvcTerm}
                onOpenChange={setSvcOpen}
                loading={svcQuery.isFetching}
                disabled={disabled || !idDealer}
              />
            ) : (
              <SearchableCombobox<Option>
                value={selectedSvc}
                onChange={(next) => {
                  if (next) remember('s', [next.id], [next])
                  set({ services: next ? [next.id] : [] })
                }}
                searchTerm={svcTerm}
                onSearchTermChange={setSvcTerm}
                items={svcItems}
                serverSideSearch
                isLoading={svcQuery.isFetching}
                getItemKey={(o) => o.id}
                getItemLabel={(o) => o.label}
                placeholder={
                  value.departments.length === 1
                    ? t('woToBeBilled.filters.services')
                    : t('woToBeBilled.filters.selectDepartmentFirst')
                }
                searchPlaceholder={t('woToBeBilled.filters.services')}
                showFooterHint={false}
                disabled={disabled || value.departments.length !== 1}
                compact
              />
            )}
            <FieldMessage id={`${WO_FILTER_SERVICES_ID}-message`} message={fieldErrors?.services ?? null} />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className={FILTER_FIELD_LABEL}>{t('woToBeBilled.filters.status')}</Label>
            <LookupMultiSelect
              options={statusItems}
              value={value.status}
              onChange={(status) => set({ status })}
              onSearchChange={setStatusTerm}
              placeholder={t('woToBeBilled.approvedOptions.all')}
              disabled={disabled}
            />
          </div>

          {textField('stock', 32)}
          {textField('wo', 64)}
          {textField('price', 9)}
          {textField('ro', 16)}
          {textField('po', 16)}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2">
            <span className={FILTER_FIELD_LABEL}>{t('woToBeBilled.filters.approved')}</span>
            <SegmentedControl<'all' | '1' | '0'>
              value={value.approved === '' ? 'all' : value.approved}
              onValueChange={(v) => set({ approved: v === 'all' ? '' : v })}
              options={[
                { value: 'all', label: approvedLabel[''] },
                { value: '1', label: approvedLabel['1'] },
                { value: '0', label: approvedLabel['0'] },
              ]}
              aria-label={t('woToBeBilled.filters.approved')}
              data-testid="wo-approved-filter"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="wo-filter-include-zero"
              checked={value.includeZero}
              onCheckedChange={(includeZero) => set({ includeZero })}
              disabled={disabled}
            />
            <Label htmlFor="wo-filter-include-zero" className="text-sm">
              {t('woToBeBilled.filters.includeZero')}
            </Label>
          </div>
          {multi ? (
            <div className="flex items-center gap-3">
              <Switch
                id="wo-filter-show-deleted-services"
                checked={value.showDeletedServices}
                onCheckedChange={(showDeletedServices) => set({ showDeletedServices })}
                disabled={disabled}
              />
              <Label htmlFor="wo-filter-show-deleted-services" className="text-sm">
                {t('woToBeBilled.filters.showDeletedServices')}
              </Label>
            </div>
          ) : null}
        </div>
      </div>
    </FilterPanel>
  )
}
