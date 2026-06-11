'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Menu, Search, Settings2, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
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

export function Header() {
  const pathname = usePathname()
  const { collapsed, setMobileOpen } = useSidebar()
  const { user, hasPermission } = useSrsMe()
  const showSystemConfig = canAccessSystemConfig(hasPermission, user?.isSystemAdmin)
  const { dealers: dealerOptions, loading: dealersLoading } = useSrsDealers()
  const {
    search,
    setSearch,
    selectedDealers,
    setSelectedDealers,
    selectedStatus,
    setSelectedStatus,
    dateRange,
    setDateRange,
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

  // Count active filters for mobile badge
  const activeFilterCount =
    (selectedDealers.length > 0 ? 1 : 0) +
    (dateRange?.from ? 1 : 0) +
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
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Desktop filters */}
        <div className="hidden md:flex min-w-0 flex-1 items-center gap-2">
          <div className="relative w-56 shrink-0 lg:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search employee, dealer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-border bg-background/50 pl-10 focus:bg-background"
            />
          </div>

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
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="justified">Justified</SelectItem>
              </SelectContent>
            </Select>
          )}

          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Mobile: filter button */}
          <button
            className="relative flex md:hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={() => setFiltersOpen(true)}
            aria-label="Open filters"
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
              title="System Config"
              aria-label="System Config"
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
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4">
            {/* Search */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Search</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search employee, dealer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 pl-10"
                />
              </div>
            </div>

            {/* Dealers */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Dealers</span>
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
                <span className="text-sm font-medium text-muted-foreground">Status</span>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="justified">Justified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date range */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Date range</span>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>

            <Button
              className="mt-2 w-full"
              onClick={() => setFiltersOpen(false)}
            >
              Apply
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
