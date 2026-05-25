'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'
import {
  readSelectedDealersCookie,
  writeSelectedDealersCookie,
} from '@/lib/filters/dealer-selection-cookie'
import { getDefaultDateRange } from '@/lib/filters/date-range-presets'

interface FilterContextType {
  search: string
  setSearch: (value: string) => void
  /** @deprecated use selectedDealers */
  selectedDealer: string
  setSelectedDealer: (value: string) => void
  selectedDealers: string[]
  setSelectedDealers: (value: string[] | ((prev: string[]) => string[])) => void
  selectedType: string
  setSelectedType: (value: string) => void
  selectedStatus: string
  setSelectedStatus: (value: string) => void
  dateRange: DateRange | undefined
  setDateRange: (value: DateRange | undefined) => void
  /** True after client mount + cookie restore (safe for dealer-dependent UI). */
  filtersHydrated: boolean
  clearFilters: () => void
}

const FilterContext = createContext<FilterContextType | undefined>(undefined)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('')
  const [selectedDealers, setSelectedDealersState] = useState<string[]>([])
  const [selectedDealer, setSelectedDealer] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [filtersHydrated, setFiltersHydrated] = useState(false)

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
    setDateRange(getDefaultDateRange())
  }, [])

  const clearFilters = () => {
    setSearch('')
    writeSelectedDealersCookie([])
    setSelectedDealersState([])
    setSelectedDealer('all')
    setSelectedType('all')
    setSelectedStatus('all')
    setDateRange(getDefaultDateRange())
  }

  return (
    <FilterContext.Provider value={{
      search,
      setSearch,
      selectedDealer,
      setSelectedDealer,
      selectedDealers,
      setSelectedDealers,
      selectedType,
      setSelectedType,
      selectedStatus,
      setSelectedStatus,
      dateRange,
      setDateRange,
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
