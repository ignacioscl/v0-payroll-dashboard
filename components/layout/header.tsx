'use client'

import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
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

const issueTypesByPage: Record<string, { value: string; label: string }[]> = {
  '/issues': [
    { value: 'only_error', label: 'Only with errors' },
    { value: 'only_error_clockout', label: 'Only without clock out' },
    { value: 'manual_punch', label: 'Manual punch' },
    { value: 'only_deletes', label: 'Deleted punches' },
    { value: 'without_salary', label: 'Without salary' },
  ],
  '/schedule': [
    { value: 'late_arrival', label: 'Late Arrival' },
    { value: 'early_departure', label: 'Early Departure' },
    { value: 'extended_lunch', label: 'Extended Lunch' },
  ],
}

export function Header() {
  const pathname = usePathname()
  const { collapsed } = useSidebar()
  const { dealers: dealerOptions, loading: dealersLoading } = useSrsDealers()
  const {
    search,
    setSearch,
    selectedDealers,
    setSelectedDealers,
    selectedType,
    setSelectedType,
    selectedStatus,
    setSelectedStatus,
    dateRange,
    setDateRange,
  } = useFilters()
  const didSanitizeDealers = useRef(false)

  useEffect(() => {
    if (didSanitizeDealers.current || dealerOptions.length === 0) return
    didSanitizeDealers.current = true

    setSelectedDealers((prev) => {
      if (prev.length === 0) return prev
      const valid = new Set(dealerOptions.map((d) => d.id))
      return prev.filter((id) => valid.has(id))
    })
  }, [dealerOptions, setSelectedDealers])

  const currentIssueTypes = issueTypesByPage[pathname] || []
  const showTypeFilter = currentIssueTypes.length > 0
  const showStatusFilter = pathname === '/schedule'

  return (
    <header
      className={cn(
        'fixed right-0 top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-card/80 px-4 backdrop-blur-xl transition-all duration-200 ease-in-out sm:px-6',
        collapsed ? 'left-[72px]' : 'left-[260px]'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <div className="relative w-56 shrink-0 sm:w-64">
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

        {showTypeFilter && (
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="h-9 w-[150px] shrink-0 border-border bg-background/50">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {currentIssueTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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

      <div className="flex shrink-0 items-center gap-4">
        <NotificationsPopover />
      </div>
    </header>
  )
}
