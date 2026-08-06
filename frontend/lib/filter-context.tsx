'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'
import {
  readSelectedDealersCookie,
  writeSelectedDealersCookie,
} from '@/lib/filters/dealer-selection-cookie'
import { getDefaultDateRange, isTodayOnlyDateRange } from '@/lib/filters/date-range-presets'
import {
  TODAY_LIVE_STATUS_ALL,
  type TodayLiveStatusFilter,
} from '@/lib/ttk/today-live-status'
import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'

interface FilterContextType {
  search: string
  setSearch: (value: string) => void
  selectedEmployee: TtkEmployeeOption | null
  setSelectedEmployee: (value: TtkEmployeeOption | null) => void
  /** @deprecated use selectedDealers */
  selectedDealer: string
  setSelectedDealer: (value: string) => void
  selectedDealers: string[]
  setSelectedDealers: (value: string[] | ((prev: string[]) => string[])) => void
  /**
   * When set (invoices district filter), header DealerMultiSelect only shows these ids.
   * `null` = no restriction.
   */
  dealerIdAllowList: string[] | null
  setDealerIdAllowList: (value: string[] | null) => void
  /** Invoices header district filter (narrows the dealer combo; not a query param). */
  selectedDistricts: number[]
  setSelectedDistricts: (value: number[]) => void
  selectedType: string
  setSelectedType: (value: string) => void
  selectedStatus: string
  setSelectedStatus: (value: string) => void
  /** Dashboard live headcount filter: on_lunch | working | out */
  selectedTodayLiveStatus: TodayLiveStatusFilter
  setSelectedTodayLiveStatus: (value: TodayLiveStatusFilter) => void
  dateRange: DateRange | undefined
  setDateRange: (value: DateRange | undefined) => void
  /** Invoice list: legacy-style period bounds (fecha_desde / fecha_hasta on statement). */
  invoiceDateFrom: Date | undefined
  invoiceDateTo: Date | undefined
  setInvoiceDateFrom: (value: Date | undefined) => void
  setInvoiceDateTo: (value: Date | undefined) => void
  /** True after client mount + cookie restore (safe for dealer-dependent UI). */
  filtersHydrated: boolean
  clearFilters: () => void
}

const FilterContext = createContext<FilterContextType | undefined>(undefined)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<TtkEmployeeOption | null>(null)
  const [selectedDealers, setSelectedDealersState] = useState<string[]>([])
  const [dealerIdAllowList, setDealerIdAllowList] = useState<string[] | null>(null)
  const [selectedDistricts, setSelectedDistricts] = useState<number[]>([])
  const [selectedDealer, setSelectedDealer] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedTodayLiveStatus, setSelectedTodayLiveStatus] =
    useState<TodayLiveStatusFilter>(TODAY_LIVE_STATUS_ALL)
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(undefined)
  const [invoiceDateFrom, setInvoiceDateFrom] = useState<Date | undefined>(undefined)
  const [invoiceDateTo, setInvoiceDateTo] = useState<Date | undefined>(undefined)
  const [filtersHydrated, setFiltersHydrated] = useState(false)

  const setDateRange = useCallback((value: DateRange | undefined) => {
    setDateRangeState(value)
    if (!isTodayOnlyDateRange(value)) {
      setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    }
  }, [])

  const setSelectedDealers = useCallback((value: string[] | ((prev: string[]) => string[])) => {
    setSelectedDealersState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      writeSelectedDealersCookie(next)
      return next
    })
  }, [])

  // Restore cookie after mount so SSR and first client render match (avoid hydration mismatch).
  useEffect(() => {
    const saved = readSelectedDealersCookie()
    if (saved.length > 0) {
      setSelectedDealersState(saved)
    }
    setFiltersHydrated(true)
  }, [])

  useEffect(() => {
    const def = getDefaultDateRange()
    setDateRange(def)
    setInvoiceDateFrom(def.from)
    setInvoiceDateTo(def.to)
  }, [setDateRange])

  const clearFilters = () => {
    setSearch('')
    setSelectedEmployee(null)
    writeSelectedDealersCookie([])
    setSelectedDealersState([])
    setDealerIdAllowList(null)
    setSelectedDealer('all')
    setSelectedType('all')
    setSelectedStatus('all')
    setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    const def = getDefaultDateRange()
    setDateRange(def)
    setInvoiceDateFrom(def.from)
    setInvoiceDateTo(def.to)
  }

  return (
    <FilterContext.Provider value={{
      search,
      setSearch,
      selectedEmployee,
      setSelectedEmployee,
      selectedDealer,
      setSelectedDealer,
      selectedDealers,
      setSelectedDealers,
      dealerIdAllowList,
      selectedDistricts,
      setSelectedDistricts,
      setDealerIdAllowList,
      selectedType,
      setSelectedType,
      selectedStatus,
      setSelectedStatus,
      selectedTodayLiveStatus,
      setSelectedTodayLiveStatus,
      dateRange,
      setDateRange,
      invoiceDateFrom,
      invoiceDateTo,
      setInvoiceDateFrom,
      setInvoiceDateTo,
      filtersHydrated,
      clearFilters
    }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  const context = useContext(FilterContext)
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider')
  }
  return context
}
