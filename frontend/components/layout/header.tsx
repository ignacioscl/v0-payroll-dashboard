'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Menu, Settings2, SlidersHorizontal } from 'lucide-react'
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
import { DatePicker } from '@/components/filters/date-picker'
import { DealerMultiSelect } from '@/components/filters/dealer-multi-select'
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
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAccessSystemConfig } from '@/lib/auth/ttk-permissions'
import { useTranslation } from '@/lib/i18n/locale-context'

export function Header() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { collapsed, setMobileOpen } = useSidebar()
  const { user, hasPermission } = useSrsMe()
  const showSystemConfig = canAccessSystemConfig(hasPermission, user?.isSystemAdmin)
  const { dealers: dealerOptions, loading: dealersLoading } = useSrsDealers()
  const {
    selectedDealers,
    setSelectedDealers,
    selectedStatus,
    setSelectedStatus,
    dateRange,
    setDateRange,
    invoiceDateFrom,
    invoiceDateTo,
    setInvoiceDateFrom,
    setInvoiceDateTo,
  } = useFilters()
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

  const showStatusFilter = pathname === '/schedule'
  const isInvoicesPage = pathname === '/billing/invoices' || pathname.startsWith('/billing/invoices/')
  const isRolesPage = pathname === '/roles' || pathname.startsWith('/roles/')
  const showDateFilter = !isRolesPage

  // Count active filters for mobile badge
  const activeFilterCount =
    (selectedDealers.length > 0 ? 1 : 0) +
    (showDateFilter
      ? isInvoicesPage
        ? (invoiceDateFrom ? 1 : 0) + (invoiceDateTo ? 1 : 0)
        : dateRange?.from
          ? 1
          : 0
      : 0) +
    (showStatusFilter && selectedStatus && selectedStatus !== 'all' ? 1 : 0)

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
          className="flex md:hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          onClick={() => setMobileOpen(true)}
          aria-label={t('layout.openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Desktop filters */}
        <div className="hidden md:flex min-w-0 flex-1 items-center gap-2">
          <EmployeeSearchInput className="w-56 shrink-0 lg:w-64" />

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
              <div className="flex shrink-0 items-center gap-2">
                <DatePicker
                  value={invoiceDateFrom}
                  onChange={setInvoiceDateFrom}
                  placeholder={t('filters.dateFrom')}
                  toDate={invoiceDateTo}
                />
                <DatePicker
                  value={invoiceDateTo}
                  onChange={setInvoiceDateTo}
                  placeholder={t('filters.dateTo')}
                  fromDate={invoiceDateFrom}
                />
              </div>
            ) : (
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            )
          ) : null}
        </div>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Mobile: filter button */}
          <button
            className="relative flex md:hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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

          {showSystemConfig && (
            <Link
              href="/settings/system"
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={t('filters.systemConfig')}
              aria-label={t('filters.systemConfig')}
            >
              <Settings2 className="h-5 w-5" />
            </Link>
          )}

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
              isInvoicesPage ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-muted-foreground">{t('filters.dateFrom')}</span>
                    <DatePicker
                      value={invoiceDateFrom}
                      onChange={setInvoiceDateFrom}
                      placeholder={t('filters.dateFrom')}
                      toDate={invoiceDateTo}
                      className="w-full min-w-0"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-muted-foreground">{t('filters.dateTo')}</span>
                    <DatePicker
                      value={invoiceDateTo}
                      onChange={setInvoiceDateTo}
                      placeholder={t('filters.dateTo')}
                      fromDate={invoiceDateFrom}
                      className="w-full min-w-0"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-muted-foreground">{t('filters.dateRange')}</span>
                  <DateRangePicker value={dateRange} onChange={setDateRange} />
                </div>
              )
            ) : null}

            <Button
              className="mt-2 w-full"
              onClick={() => setFiltersOpen(false)}
            >
              {t('common.apply')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
