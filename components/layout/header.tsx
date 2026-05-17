'use client'

import { Bell, MagnifyingGlass, CalendarBlank } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useFilters } from '@/lib/filter-context'
import { usePathname } from 'next/navigation'
import { agencies } from '@/lib/mock-data'
import { useSidebar } from '@/lib/sidebar-context'
import { cn } from '@/lib/utils'

// Issue types based on current page
const issueTypesByPage: Record<string, { value: string; label: string }[]> = {
  '/issues': [
    { value: 'missing_lunch_out', label: 'Missing Lunch' },
    { value: 'missing_clock_out', label: 'Missing Clock Out' },
    { value: 'manual_punch', label: 'Manual Punch' },
    { value: 'deleted_punch', label: 'Deleted Punch' },
    { value: 'modified_payment', label: 'Modified Payment' },
  ],
  '/schedule': [
    { value: 'late_arrival', label: 'Late Arrival' },
    { value: 'early_departure', label: 'Early Departure' },
    { value: 'extended_lunch', label: 'Extended Lunch' },
  ],
}

export function Header() {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const { collapsed } = useSidebar()
  const {
    search,
    setSearch,
    selectedDealer,
    setSelectedDealer,
    selectedType,
    setSelectedType,
    selectedStatus,
    setSelectedStatus,
    dateRange,
    setDateRange,
  } = useFilters()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Get issue types for current page
  const currentIssueTypes = issueTypesByPage[pathname] || []
  const showTypeFilter = currentIssueTypes.length > 0
  const showStatusFilter = pathname === '/issues' || pathname === '/schedule'

  return (
    <header
      className={cn(
        'fixed right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6 transition-all duration-200 ease-in-out',
        collapsed ? 'left-[72px]' : 'left-[260px]'
      )}
    >
      {/* Filters */}
      <div className="flex items-center gap-3 flex-1">
        {/* Search */}
        <div className="relative w-64">
          <MagnifyingGlass
            size={18}
            weight="regular"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search employee, dealer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-background border-border"
          />
        </div>

        {/* Dealer Filter */}
        <Select value={selectedDealer} onValueChange={setSelectedDealer}>
          <SelectTrigger className="w-[160px] border-border bg-background">
            <SelectValue placeholder="All Dealers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dealers</SelectItem>
            {agencies.map((agency) => (
              <SelectItem key={agency.id} value={agency.id}>
                {agency.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Type Filter - only show on relevant pages */}
        {showTypeFilter && (
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[160px] border-border bg-background">
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

        {/* Status Filter - only show on relevant pages */}
        {showStatusFilter && (
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[140px] border-border bg-background">
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

        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="gap-2 border-border bg-background min-w-[160px]"
            >
              <CalendarBlank size={18} weight="regular" />
              {mounted && dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, 'MMM dd')} -{' '}
                    {format(dateRange.to, 'MMM dd')}
                  </>
                ) : (
                  format(dateRange.from, 'MMM dd, yyyy')
                )
              ) : (
                'Select dates'
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Right side - Notifications */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell size={22} weight="regular" />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white">
            12
          </span>
        </Button>
      </div>
    </header>
  )
}
