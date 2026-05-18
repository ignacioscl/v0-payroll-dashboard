'use client'

import { Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { dealerOptions } from '@/lib/dealers'
import { DateRangePicker } from '@/components/filters/date-range-picker'
import { DealerSelect } from '@/components/filters/dealer-select'
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

  // Get issue types for current page
  const currentIssueTypes = issueTypesByPage[pathname] || []
  const showTypeFilter = currentIssueTypes.length > 0
  const showStatusFilter = pathname === '/issues' || pathname === '/schedule'

  return (
    <header
      className={cn(
        'fixed right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 backdrop-blur-xl px-6 transition-all duration-200 ease-in-out',
        collapsed ? 'left-[72px]' : 'left-[260px]'
      )}
    >
      {/* Filters */}
      <div className="flex items-center gap-3 flex-1">
        {/* Search */}
        <div className="relative w-72">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4"
          />
          <Input
            placeholder="Search employee, dealer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-background/50 border-border focus:bg-background transition-colors"
          />
        </div>

        {/* Dealer Filter */}
        <DealerSelect
          dealers={dealerOptions}
          value={selectedDealer}
          onValueChange={setSelectedDealer}
        />

        {/* Type Filter - only show on relevant pages */}
        {showTypeFilter && (
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[160px] border-border bg-background/50 focus:bg-background transition-colors">
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
            <SelectTrigger className="w-[140px] border-border bg-background/50 focus:bg-background transition-colors">
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
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Right side - Notifications */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative hover:bg-muted transition-colors"
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground shadow-lg shadow-destructive/30">
            12
          </span>
        </Button>
      </div>
    </header>
  )
}
