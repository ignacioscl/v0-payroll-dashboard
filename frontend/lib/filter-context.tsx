'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'
import {
  readSelectedDealersCookie,
  writeSelectedDealersCookie,
} from '@/lib/filters/dealer-selection-cookie'
import {
  includedErrorTypesFrom,
  readExcludedErrorTypesCookie,
  writeExcludedErrorTypesCookie,
} from '@/lib/filters/error-types-cookie'
import { useSrsMe } from '@/lib/auth/use-srs-me'
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
  /**
   * Tipos de error DESTILDADOS por el usuario (lo que se persiste).
   * `[]` = los tres visibles; `[1,2,3]` = los tres excluidos.
   * Para un usuario externo esto vale siempre `[]`: la policy le prohíbe
   * filtrar por tipo de error, así que la preferencia se ignora sin esperar
   * a un effect (si no, pasa un render con el filtro puesto).
   */
  excludedErrorTypes: number[]
  /** Derivado, nunca persistido: `{1,2,3} − excluidos`. */
  includedErrorTypes: number[]
  toggleErrorType: (type: number) => void
  /** Vuelve a incluir los tres. Lo usa el "Clear all" del panel de filtros. */
  resetErrorTypes: () => void
  /** False mientras `/me` no resolvió: ninguna query afectada se habilita. */
  errorTypesReady: boolean
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

/** Referencia estable: evita re-render en cada pasada para el caso externo. */
const EMPTY_EXCLUDED: number[] = []

export function FilterProvider({ children }: { children: ReactNode }) {
  const { user, loading: meLoading } = useSrsMe()
  const isExternal = Boolean(user?.isCompanyTypeCompany)
  // Mientras no se sepa quién es, ninguna query afectada por la exclusión arranca:
  // un effect corre DESPUÉS del render, así que sin este gate pasaría un pedido
  // con la exclusión puesta antes de poder limpiarla.
  const errorTypesReady = !meLoading
  const [search, setSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<TtkEmployeeOption | null>(null)
  const [selectedDealers, setSelectedDealersState] = useState<string[]>([])
  const [dealerIdAllowList, setDealerIdAllowList] = useState<string[] | null>(null)
  const [selectedDistricts, setSelectedDistricts] = useState<number[]>([])
  const [selectedDealer, setSelectedDealer] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [excludedErrorTypesState, setExcludedErrorTypesState] = useState<number[]>([])
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
  // Las dos cookies se restauran en el MISMO effect y antes de `setFiltersHydrated(true)`:
  // ese flag es el gate de 10+ queries, así que un effect aparte dejaría una ventana
  // con `filtersHydrated` en true y la exclusión todavía vacía → primer fetch con el
  // filtro equivocado y refetch inmediato.
  useEffect(() => {
    const saved = readSelectedDealersCookie()
    if (saved.length > 0) {
      setSelectedDealersState(saved)
    }
    const savedErrorTypes = readExcludedErrorTypesCookie()
    if (savedErrorTypes.length > 0) {
      setExcludedErrorTypesState(savedErrorTypes)
    }
    setFiltersHydrated(true)
  }, [])

  // El externo no puede filtrar por tipo de error: el valor EFECTIVO se resuelve
  // en la misma renderización en que se conoce la identidad, no en un effect.
  const excludedErrorTypes = isExternal ? EMPTY_EXCLUDED : excludedErrorTypesState
  const includedErrorTypes = useMemo(
    () => includedErrorTypesFrom(excludedErrorTypes),
    [excludedErrorTypes],
  )

  // El updater es PURO: la cookie se escribe en un effect. Con el write adentro,
  // React lo invoca dos veces en StrictMode y un "destildar los tres de una"
  // (Clear all) se aplicaba dos veces y volvía al estado original.
  const toggleErrorType = useCallback((type: number) => {
    setExcludedErrorTypesState((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type].sort((a, b) => a - b),
    )
  }, [])

  const resetErrorTypes = useCallback(() => {
    setExcludedErrorTypesState((prev) => (prev.length === 0 ? prev : []))
  }, [])

  // Persistencia. Después de hidratar, para no pisar la cookie con el [] inicial.
  useEffect(() => {
    if (!filtersHydrated) return
    writeExcludedErrorTypesCookie(excludedErrorTypesState)
  }, [filtersHydrated, excludedErrorTypesState])

  // El borrado FÍSICO de la cookie sí puede vivir en un effect: es limpieza, no gate.
  useEffect(() => {
    if (!isExternal) return
    if (excludedErrorTypesState.length === 0) return
    setExcludedErrorTypesState([])
  }, [isExternal, excludedErrorTypesState.length])

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
    setExcludedErrorTypesState([])
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
      excludedErrorTypes,
      includedErrorTypes,
      toggleErrorType,
      resetErrorTypes,
      errorTypesReady,
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
