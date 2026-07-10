'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ReceiptText } from 'lucide-react'

import { PageHeading } from '@/components/layout/page-heading'
import { InvoiceFilterDeck } from '@/components/billing/invoice-filter-deck'
import { InvoiceSummaryStrip } from '@/components/billing/invoice-summary-strip'
import { InvoiceListTable } from '@/components/billing/invoice-list-table'
import { typesToCsv, type InvoiceTypeState } from '@/components/billing/invoice-type-filter'
import {
  EMPTY_ADVANCED_FILTERS,
  idsToCsv,
  type InvoiceAdvancedFilterState,
} from '@/lib/invoice-advanced-filters'
import { useFilters } from '@/lib/filter-context'
import { formatDateParam } from '@/lib/ttk/map-header-filters'
import { useTranslation } from '@/lib/i18n/locale-context'
import { useInvoiceList, type InvoiceListInput } from '@/hooks/use-invoice-list'

const ALL_TYPES: InvoiceTypeState = { wo: true, ttk: true, generic: true }

type TriState = 'all' | '1' | '0'

function formatUsDate(date: Date): string {
  return format(date, 'MM/dd/yyyy')
}

function formatUsDateRange(from: Date | undefined, to: Date | undefined): string | null {
  if (!from) return null
  const end = to ?? from
  if (
    from.getFullYear() === end.getFullYear() &&
    from.getMonth() === end.getMonth() &&
    from.getDate() === end.getDate()
  ) {
    return formatUsDate(from)
  }
  return `${formatUsDate(from)} – ${formatUsDate(end)}`
}

export default function InvoicesPage() {
  const { t } = useTranslation()
  const { invoiceDateFrom, invoiceDateTo, selectedDealers, filtersHydrated } = useFilters()

  const [types, setTypes] = useState<InvoiceTypeState>(ALL_TYPES)
  const [payed, setPayed] = useState<TriState>('0')
  const [sended, setSended] = useState<TriState>('all')
  const [hideZero, setHideZero] = useState(true)
  const [advanced, setAdvanced] = useState<InvoiceAdvancedFilterState>(EMPTY_ADVANCED_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [roPo, setRoPo] = useState('')
  const [stock, setStock] = useState('')
  const [checkNumber, setCheckNumber] = useState('')
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    const id = setTimeout(() => setRoPo(advanced.roPo.trim()), 350)
    return () => clearTimeout(id)
  }, [advanced.roPo])

  useEffect(() => {
    const id = setTimeout(() => setStock(advanced.stock.trim()), 350)
    return () => clearTimeout(id)
  }, [advanced.stock])

  useEffect(() => {
    const id = setTimeout(() => setCheckNumber(advanced.checkNumber.trim()), 350)
    return () => clearTimeout(id)
  }, [advanced.checkNumber])

  const idDealer = useMemo(() => selectedDealers.join(','), [selectedDealers])
  const primaryDealerId = useMemo(() => {
    const first = selectedDealers[0]
    if (!first) return null
    const n = Number(first)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [selectedDealers])
  const headerRange = useMemo(
    () => ({
      fechaDesde: formatDateParam(invoiceDateFrom),
      fechaHasta: formatDateParam(invoiceDateTo),
    }),
    [invoiceDateFrom, invoiceDateTo],
  )
  const headerRangeLabel = useMemo(
    () => formatUsDateRange(invoiceDateFrom, invoiceDateTo),
    [invoiceDateFrom, invoiceDateTo],
  )

  const hasDealer = selectedDealers.length > 0
  const hasDates = Boolean(headerRange.fechaDesde && headerRange.fechaHasta)
  const ready = filtersHydrated && hasDealer && hasDates

  const input = useMemo<InvoiceListInput | null>(() => {
    if (!ready) return null
    return {
      fechaDesde: headerRange.fechaDesde,
      fechaHasta: headerRange.fechaHasta,
      idDealer,
      types: typesToCsv(types),
      search: search || undefined,
      payed: payed === 'all' ? undefined : payed,
      sended: sended === 'all' ? undefined : sended,
      includeZero: !hideZero,
      idDepartment: idsToCsv(advanced.departmentIds),
      idInvoiceService: idsToCsv(advanced.serviceIds),
      wo: advanced.woNumbers.length ? advanced.woNumbers.join(',') : undefined,
      roPo: roPo || undefined,
      stock: stock || undefined,
      checkDate: advanced.checkDate ? formatDateParam(advanced.checkDate) : undefined,
      checkNumber: checkNumber || undefined,
      idAuthor: advanced.employeeId ?? undefined,
      dueOn: advanced.overdue || undefined,
      showDeleted: advanced.showDeleted || undefined,
    }
  }, [
    ready,
    headerRange,
    idDealer,
    types,
    search,
    payed,
    sended,
    hideZero,
    advanced.departmentIds,
    advanced.serviceIds,
    advanced.woNumbers,
    advanced.checkDate,
    advanced.employeeId,
    advanced.overdue,
    advanced.showDeleted,
    roPo,
    stock,
    checkNumber,
  ])

  const query = useInvoiceList(input, pageSize)
  const summary = query.data?.pages[0]?.summary
  const showSummary = ready

  return (
    <div className="space-y-4">
      <PageHeading
        title={t('invoices.title')}
        subtitle={
          headerRangeLabel ? (
            <span className="tabular-nums">{headerRangeLabel}</span>
          ) : (
            t('invoices.subtitle')
          )
        }
        icon={<ReceiptText />}
        variant="info"
      />

      <InvoiceFilterDeck
        types={types}
        onTypesChange={setTypes}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        payed={payed}
        onPayedChange={setPayed}
        sended={sended}
        onSendedChange={setSended}
        hideZero={hideZero}
        onHideZeroChange={setHideZero}
        advanced={advanced}
        onAdvancedChange={setAdvanced}
        idDealer={idDealer}
        primaryDealerId={primaryDealerId}
        disabled={!ready}
      />

      {showSummary ? (
        <InvoiceSummaryStrip
          summary={summary}
          isLoading={query.isFetching && !summary}
        />
      ) : null}

      <InvoiceListTable
        query={query}
        input={input}
        hydrated={filtersHydrated}
        hasDealer={hasDealer}
        hasDates={hasDates}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        showDealerSubline={selectedDealers.length > 1}
        idDealer={
          primaryDealerId != null
            ? String(primaryDealerId)
            : (idDealer.split(',')[0] ?? '')
        }
        payedFilter={payed === 'all' ? undefined : payed}
      />
    </div>
  )
}
