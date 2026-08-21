'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { format } from 'date-fns'
import { Plus, ReceiptText } from 'lucide-react'

import { GenericInvoiceDialog } from '@/components/billing/generic-invoice-dialog'
import { InvoiceFilterDeck } from '@/components/billing/invoice-filter-deck'
import { PageHeading } from '@/components/layout/page-heading'
import { Button } from '@/components/ui/button'
import { useGenericInvoiceConfig } from '@/hooks/use-generic-invoice'
import { InvoiceSummaryStrip } from '@/components/billing/invoice-summary-strip'
import { InvoiceListTable } from '@/components/billing/invoice-list-table'
import { typesToCsv, type InvoiceTypeState } from '@/components/billing/invoice-type-filter'
import {
  EMPTY_ADVANCED_FILTERS,
  idsToCsv,
  type InvoiceAdvancedFilterState,
} from '@/lib/invoice-advanced-filters'
import {
  isInvoiceSearchLock,
  type InvoiceDeletedMode,
} from '@/lib/invoice-search-lock'
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
  const genericConfig = useGenericInvoiceConfig()
  const [genericOpen, setGenericOpen] = useState(false)
  const {
    invoiceDateFrom,
    invoiceDateTo,
    selectedDealers,
    filtersHydrated,
    setDealerIdAllowList,
  } = useFilters()

  const [types, setTypes] = useState<InvoiceTypeState>(ALL_TYPES)
  const [payed, setPayed] = useState<TriState>('0')
  const [sended, setSended] = useState<TriState>('all')
  const [hideZero, setHideZero] = useState(true)
  const [ignorePeriod, setIgnorePeriod] = useState(false)
  const [deleted, setDeleted] = useState<InvoiceDeletedMode>('hide')
  const [employeeWorkedIds, setEmployeeWorkedIds] = useState<number[]>([])
  const [advanced, setAdvanced] = useState<InvoiceAdvancedFilterState>(EMPTY_ADVANCED_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [roPo, setRoPo] = useState('')
  const [stock, setStock] = useState('')
  const [checkNumber, setCheckNumber] = useState('')
  const [pageSize, setPageSize] = useState(25)
  // Default matches Nest ORDER BY fecha_desde DESC when no orderBy is sent.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'period', desc: true }])

  useEffect(() => {
    return () => setDealerIdAllowList(null)
  }, [setDealerIdAllowList])

  const handleAdvancedChange = (next: InvoiceAdvancedFilterState) => {
    setAdvanced(next)
    // G8: setting check date forces Paid = Yes in the UI control too
    if (next.checkDate) setPayed('1')
  }

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

  useEffect(() => {
    if (!types.ttk && !types.generic) setEmployeeWorkedIds([])
  }, [types.ttk, types.generic])

  const searchLock = isInvoiceSearchLock({
    search,
    exactMatch: advanced.exactMatch,
    employeeWorkedIds,
  })
  const ignorePeriodEffective = searchLock || ignorePeriod
  const includeZeroEffective = searchLock || !hideZero
  const deletedBeforeSearchLock = useRef<InvoiceDeletedMode>('hide')
  const wasSearchLock = useRef(false)

  useEffect(() => {
    if (searchLock && !wasSearchLock.current) {
      deletedBeforeSearchLock.current = deleted
      if (deleted !== 'all') setDeleted('all')
    } else if (!searchLock && wasSearchLock.current) {
      setDeleted(deletedBeforeSearchLock.current)
    }
    wasSearchLock.current = searchLock
    // Snapshot only on the lock edge; `deleted` must not re-trigger the snap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchLock])
  const hasDealer = selectedDealers.length > 0
  const hasDates = Boolean(headerRange.fechaDesde && headerRange.fechaHasta)
  const ready = filtersHydrated && hasDealer && hasDates

  const sortParams = useMemo(() => {
    const col = sorting[0]
    if (!col) return {} as { orderBy?: 'invoiceNro' | 'dateFrom'; orderDir?: 'asc' | 'desc' }
    if (col.id === 'invoice') {
      return { orderBy: 'invoiceNro' as const, orderDir: col.desc ? ('desc' as const) : ('asc' as const) }
    }
    if (col.id === 'period') {
      return { orderBy: 'dateFrom' as const, orderDir: col.desc ? ('desc' as const) : ('asc' as const) }
    }
    return {}
  }, [sorting])

  const input = useMemo<InvoiceListInput | null>(() => {
    if (!ready) return null
    const checkDate = advanced.checkDate ? formatDateParam(advanced.checkDate) : undefined
    return {
      fechaDesde: headerRange.fechaDesde,
      fechaHasta: headerRange.fechaHasta,
      idDealer,
      types: typesToCsv(types),
      search: search || undefined,
      // G8: check date implies Paid=Yes (legacy parity)
      payed: checkDate ? '1' : payed === 'all' ? undefined : payed,
      sended: sended === 'all' ? undefined : sended,
      includeZero: includeZeroEffective,
      idDepartment: idsToCsv(advanced.departmentIds),
      idInvoiceService: idsToCsv(advanced.serviceIds),
      wo: advanced.woNumbers.length ? advanced.woNumbers.join(',') : undefined,
      roPo: roPo || undefined,
      stock: stock || undefined,
      checkDate,
      checkNumber: checkNumber || undefined,
      idAuthorIn: idsToCsv(advanced.authorIds),
      authorsExclude: advanced.authorsExclude && advanced.authorIds.length > 0 ? 1 : undefined,
      createdBySystem: advanced.createdBySystem ? 1 : undefined,
      exactMatch: advanced.exactMatch || undefined,
      dueOn: advanced.overdue || undefined,
      deleted,
      employeeWorkedIn: idsToCsv(employeeWorkedIds),
      ignorePeriod: ignorePeriodEffective || undefined,
      ...sortParams,
    }
  }, [
    ready,
    headerRange,
    idDealer,
    types,
    search,
    payed,
    sended,
    includeZeroEffective,
    deleted,
    ignorePeriodEffective,
    employeeWorkedIds,
    advanced.departmentIds,
    advanced.serviceIds,
    advanced.woNumbers,
    advanced.checkDate,
    advanced.authorIds,
    advanced.authorsExclude,
    advanced.createdBySystem,
    advanced.exactMatch,
    advanced.overdue,
    roPo,
    stock,
    checkNumber,
    sortParams,
  ])

  const query = useInvoiceList(input, pageSize)
  const summary = query.data?.pages[0]?.summary
  // Money excludes deleted only in `all` (F.6): in `hide` there are none, and in
  // `only` the amounts ARE the deleted ones, so the note would be misleading.
  // Shared by the top strip and the table footer so the rule lives in one place.
  const excludesDeleted =
    deleted === 'all' && (summary?.deletedInList ?? 0) > 0
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
        actions={
          genericConfig.data?.canCreate ? (
            <Button type="button" onClick={() => setGenericOpen(true)}>
              <Plus />
              {t('invoices.generic.newButton')}
            </Button>
          ) : null
        }
      />
      <GenericInvoiceDialog open={genericOpen} onOpenChange={setGenericOpen} />

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
        ignorePeriod={ignorePeriod}
        onIgnorePeriodChange={setIgnorePeriod}
        deleted={deleted}
        onDeletedChange={setDeleted}
        employeeWorkedIds={employeeWorkedIds}
        onEmployeeWorkedChange={setEmployeeWorkedIds}
        searchLock={searchLock}
        advanced={advanced}
        onAdvancedChange={handleAdvancedChange}
        idDealer={idDealer}
        disabled={!ready}
      />

      {showSummary ? (
        <InvoiceSummaryStrip
          summary={summary}
          isLoading={query.isFetching && !summary}
          showExcludesDeleted={excludesDeleted}
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
        sorting={sorting}
        onSortingChange={setSorting}
        showDealerSubline={selectedDealers.length > 1}
        idDealer={
          primaryDealerId != null
            ? String(primaryDealerId)
            : (idDealer.split(',')[0] ?? '')
        }
        payedFilter={payed === 'all' ? undefined : payed}
        showExcludesDeleted={excludesDeleted}
      />
    </div>
  )
}
