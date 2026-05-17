'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'

// Fixed base date to match mock data
const BASE_DATE = new Date('2026-05-12T12:00:00.000Z')

interface FilterContextType {
  search: string
  setSearch: (value: string) => void
  selectedDealer: string
  setSelectedDealer: (value: string) => void
  selectedType: string
  setSelectedType: (value: string) => void
  selectedStatus: string
  setSelectedStatus: (value: string) => void
  dateRange: DateRange | undefined
  setDateRange: (value: DateRange | undefined) => void
  clearFilters: () => void
}

const FilterContext = createContext<FilterContextType | undefined>(undefined)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('')
  const [selectedDealer, setSelectedDealer] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  useEffect(() => {
    const to = BASE_DATE
    const from = new Date(BASE_DATE)
    from.setDate(from.getDate() - 7)
    setDateRange({ from, to })
  }, [])

  const clearFilters = () => {
    setSearch('')
    setSelectedDealer('all')
    setSelectedType('all')
    setSelectedStatus('all')
    const to = BASE_DATE
    const from = new Date(BASE_DATE)
    from.setDate(from.getDate() - 7)
    setDateRange({ from, to })
  }

  return (
    <FilterContext.Provider value={{
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
