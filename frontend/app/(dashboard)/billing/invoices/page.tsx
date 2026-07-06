'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ReceiptText } from 'lucide-react'

import { PageHeading } from '@/components/layout/page-heading'
import { InvoiceFilterDeck } from '@/components/billing/invoice-filter-deck'
import { InvoiceSummaryStrip } from '@/components/billing/invoice-summary-strip'
import { InvoiceListTable } from '@/components/billing/invoice-list-table'
import { typesToCsv, type InvoiceTypeState } from '@/components/billing/invoice-type-filter'
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
  const { dateRange, selectedDealers, filtersHydrated } = useFilters()

  const [types, setTypes] = useState<InvoiceTypeState>(ALL_TYPES)
  const [payed, setPayed] = useState<TriState>('all')
  const [sended, setSended] = useState<TriState>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(id)
  }, [searchInput])

  const idDealer = useMemo(() => selectedDealers.join(','), [selectedDealers])
  const headerRange = useMemo(
    () => ({
      fechaDesde: formatDateParam(dateRange?.from),
      fechaHasta: formatDateParam(dateRange?.to ?? dateRange?.from),
    }),
    [dateRange],
  )
  const headerRangeLabel = useMemo(
    () => formatUsDateRange(dateRange?.from, dateRange?.to),
    [dateRange],
  )

  const hasDealer = selectedDealers.length > 0
  const hasDates = Boolean(headerRange.fechaDesde)
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
    }
  }, [ready, headerRange, idDealer, types, search, payed, sended])

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
      />
    </div>
  )
}
