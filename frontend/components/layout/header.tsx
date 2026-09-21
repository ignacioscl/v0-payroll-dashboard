'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Menu, SlidersHorizontal } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { EmployeeSearchInput } from '@/components/filters/employee-search-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFilters } from '@/lib/filter-context'
import { usePathname } from 'next/navigation'
import { DateRangePicker } from '@/components/filters/date-range-picker'
import { DealerMultiSelect } from '@/components/filters/dealer-multi-select'
import { DistrictMultiSelect } from '@/components/filters/district-multi-select'
import { IssuesAddPunchHeaderButton } from '@/components/ttk/issues-add-punch-header-button'
import { getDefaultDateRange } from '@/lib/filters/date-range-presets'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { useSidebar } from '@/lib/sidebar-context'
import { cn } from '@/lib/utils'
import { NotificationsPopover } from './notifications-popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/locale-context'

export function Header() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { collapsed, setMobileOpen } = useSidebar()
  const { dealers: allDealerOptions, loading: dealersLoading } = useSrsDealers()
  const {
    selectedDealers,
    setSelectedDealers,
    dealerIdAllowList,
    selectedStatus,
    setSelectedStatus,
    dateRange,
    setDateRange,
    invoiceDateFrom,
    invoiceDateTo,
    setInvoiceDateFrom,
    setInvoiceDateTo,
    invoiceIgnorePeriod,
    setInvoiceIgnorePeriod,
    invoiceIgnorePeriodLocked,
  } = useFilters()
  const dealerOptions = useMemo(() => {
    if (!dealerIdAllowList || dealerIdAllowList.length === 0) return allDealerOptions
    const allow = new Set(dealerIdAllowList)
    return allDealerOptions.filter((d) => allow.has(d.id))
  }, [allDealerOptions, dealerIdAllowList])
  const didSanitizeDealers = useRef(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    if (didSanitizeDealers.current || dealerOptions.length === 0) return
    didSanitizeDealers.current = true

    setSelectedDealers((prev) => {
      if (prev.length === 0) return prev
      const valid = new Set(dealerOptions.map((d) => d.id))
      return prev.filter((id) => valid.has(id))
    })
  }, [dealerOptions, setSelectedDealers])

  // Invoices guarda el período como dos fechas sueltas (fecha_desde / fecha_hasta del
  // statement); el picker compartido habla en rangos. Se traduce acá y nadie más se entera.
  const invoiceRange = useMemo<DateRange | undefined>(
    () => (invoiceDateFrom ? { from: invoiceDateFrom, to: invoiceDateTo } : undefined),
    [invoiceDateFrom, invoiceDateTo],
  )
  const setInvoiceRange = useCallback(
    (next: DateRange | undefined) => {
      // Sin fechas el listado no carga (el backend exige fechaDesde/fechaHasta aunque se
      // ignore el período), así que «Clear» vuelve al rango por defecto, igual que
      // `clearFilters()`. Si no, limpiar dejaría la pantalla en un cartel sin salida.
      const range = next?.from ? next : getDefaultDateRange()
      setInvoiceDateFrom(range.from)
      // Un solo día elegido = desde y hasta el mismo día, no un "hasta" vacío.
      setInvoiceDateTo(range.to ?? range.from)
    },
    [setInvoiceDateFrom, setInvoiceDateTo],
  )

  const showStatusFilter = pathname === '/schedule'
  const isInvoicesPage = pathname === '/billing/invoices' || pathname.startsWith('/billing/invoices/')
  const isRolesPage = pathname === '/roles' || pathname.startsWith('/roles/')
  const isIssuesPage = pathname === '/issues' || pathname.startsWith('/issues/')
  const showDateFilter = !isRolesPage
  // El eje pendiente/corregido NO vive acá: a ~1000px esta fila ya tiene cinco
  // controles de ancho fijo y el quinto se desbordaba sobre el botón de la
  // derecha. Vive en cada pantalla, junto a lo que gobierna (ErrorStatusToggle).

  // Count active filters for mobile badge
  const activeFilterCount =
    (selectedDealers.length > 0 ? 1 : 0) +
    (showDateFilter
      ? isInvoicesPage
        ? invoiceIgnorePeriod || invoiceIgnorePeriodLocked || invoiceRange?.from
          ? 1
          : 0
        : dateRange?.from
          ? 1
          : 0
      : 0) +
    (showStatusFilter && selectedStatus && selectedStatus !== 'all' ? 1 : 0)

  const invoiceRangeProps = {
    value: invoiceRange,
    onChange: setInvoiceRange,
    ignorable: true,
    ignored: invoiceIgnorePeriod,
    onIgnoredChange: setInvoiceIgnorePeriod,
    ignoreLocked: invoiceIgnorePeriodLocked,
    ignoreHint: invoiceIgnorePeriodLocked
      ? t('invoices.filterIgnoreDatesForced')
      : t('invoices.filterIgnoreDatesTooltip'),
  }

  return (
    <>
      <header
        className={cn(
          'fixed right-0 top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-card/80 px-4 backdrop-blur-xl transition-all duration-200 ease-in-out',
          // Mobile: full width. Desktop: offset by sidebar.
          'left-0',
          collapsed ? 'md:left-[72px]' : 'md:left-[260px]'
        )}
      >
        {/* Mobile left: hamburger */}
        <button
          className="flex md:hidden h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          onClick={() => setMobileOpen(true)}
          aria-label={t('layout.openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Desktop filters */}
        <div className="hidden md:flex min-w-0 flex-1 items-center gap-2">
          <EmployeeSearchInput className="w-56 shrink-0 lg:w-64" />

          {isInvoicesPage ? (
            <DistrictMultiSelect className="w-[170px] shrink-0" />
          ) : null}

          <DealerMultiSelect
            dealers={dealerOptions}
            value={selectedDealers}
            onChange={setSelectedDealers}
            loading={dealersLoading}
            className="w-[200px] shrink-0"
          />

          {showStatusFilter && (
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-9 w-[130px] shrink-0 border-border bg-background/50">
                <SelectValue placeholder={t('filters.allStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allStatus')}</SelectItem>
                <SelectItem value="pending">{t('filters.pending')}</SelectItem>
                <SelectItem value="reviewed">{t('filters.reviewed')}</SelectItem>
                <SelectItem value="justified">{t('filters.justified')}</SelectItem>
              </SelectContent>
            </Select>
          )}

          {showDateFilter ? (
            isInvoicesPage ? (
              <DateRangePicker {...invoiceRangeProps} className="shrink-0" />
            ) : (
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
                maxRangeYears={isIssuesPage ? 1 : undefined}
              />
            )
          ) : null}

        </div>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-2">
          {isIssuesPage ? <IssuesAddPunchHeaderButton /> : null}

          {/* Mobile: filter button */}
          <button
            className="relative flex md:hidden h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={() => setFiltersOpen(true)}
            aria-label={t('filters.openFilters')}
          >
            <SlidersHorizontal className="h-5 w-5" />
            {activeFilterCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>

          <NotificationsPopover />
        </div>
      </header>

      {/* Mobile filters sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="h-auto rounded-t-2xl pb-8">
          <SheetHeader className="pb-4">
            <SheetTitle>{t('punch.filterPanelTitle')}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4">
            {/* Search */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">{t('common.search')}</span>
              <EmployeeSearchInput className="w-full" />
            </div>

            {/* Dealers */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">{t('dealer.labelPlural')}</span>
              <DealerMultiSelect
                dealers={dealerOptions}
                value={selectedDealers}
                onChange={setSelectedDealers}
                loading={dealersLoading}
                className="w-full"
              />
            </div>

            {/* Status — only on schedule page */}
            {showStatusFilter && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-muted-foreground">{t('common.status')}</span>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t('filters.allStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.allStatus')}</SelectItem>
                    <SelectItem value="pending">{t('filters.pending')}</SelectItem>
                    <SelectItem value="reviewed">{t('filters.reviewed')}</SelectItem>
                    <SelectItem value="justified">{t('filters.justified')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date range / invoice period — hidden on Roles */}
            {showDateFilter ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-muted-foreground">{t('filters.dateRange')}</span>
                {isInvoicesPage ? (
                  <DateRangePicker {...invoiceRangeProps} className="w-full min-w-0" />
                ) : (
                  <DateRangePicker
                    value={dateRange}
                    onChange={setDateRange}
                    maxRangeYears={isIssuesPage ? 1 : undefined}
                  />
                )}
              </div>
            ) : null}


            <Button
              className="mt-2 w-full cursor-pointer"
              onClick={() => setFiltersOpen(false)}
            >
              <Check className="h-4 w-4" />
              {t('common.apply')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
