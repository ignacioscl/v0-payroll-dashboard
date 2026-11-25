'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'
import {
  readSelectedDealersCookie,
  writeSelectedDealersCookie,
} from '@/lib/filters/dealer-selection-cookie'
import {
  ALL_FLAG_TYPES,
  includedErrorTypesFrom,
  readExcludedErrorTypesCookie,
  writeExcludedErrorTypesCookie,
} from '@/lib/filters/error-types-cookie'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canViewFakeGps } from '@/lib/auth/ttk-permissions'
import { getDefaultDateRange, isTodayOnlyDateRange } from '@/lib/filters/date-range-presets'
import type { InvoiceDateMode } from '@/lib/filters/date-range-open-ends'
import { fromYmd, readWoHeaderMemory, toYmd, woHeaderOnEntry, writeWoHeaderMemory } from '@/lib/filters/wo-header-memory'
import {
  TODAY_LIVE_STATUS_ALL,
  type TodayLiveStatusFilter,
} from '@/lib/ttk/today-live-status'
import { DEFAULT_ERROR_STATUS, type ErrorStatus } from '@/lib/ttk/error-status'
import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import { defaultClosingMonth } from '@/lib/reports/monthly-closing-month'
import { lastSundayNyYmd } from '@/lib/reports/open-invoices-dates'

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
   * Eje pendiente/corregido. Vive acá —y no en cada pantalla— porque es un filtro
   * de la misma naturaleza que dealers y rango, y tiene que valer igual en las dos.
   *
   * Para un usuario externo vale siempre `pending`: la policy le prohíbe cualquier
   * `issueType` distinto de `all`, y se resuelve en el MISMO render en que se
   * conoce la identidad (no en un effect, que dejaría pasar un pedido con 403).
   */
  errorStatus: ErrorStatus
  setErrorStatus: (value: ErrorStatus) => void
  /**
   * Tipos de error DESTILDADOS por el usuario (lo que se persiste).
   * `[]` = nada excluido (los 8, recortados por permiso en cada pantalla).
   * Para un usuario externo esto vale siempre `[]`.
   */
  excludedErrorTypes: number[]
  /** Tipos que este usuario puede ver: `{1..8}` sin Fake GPS (8) si no tiene su permiso. */
  allowedFlagTypes: readonly number[]
  /** Derivado, nunca persistido: `allowedFlagTypes − excluidos`. */
  includedErrorTypes: number[]
  toggleErrorType: (type: number) => void
  /** Vuelve a incluir todos. Lo usa el "Clear all" del panel de filtros. */
  resetErrorTypes: () => void
  /** False mientras `/me` no resolvió: ninguna query afectada se habilita. */
  errorTypesReady: boolean
  /** Dashboard live headcount filter: on_lunch | working | out */
  selectedTodayLiveStatus: TodayLiveStatusFilter
  setSelectedTodayLiveStatus: (value: TodayLiveStatusFilter) => void
  dateRange: DateRange | undefined
  /** Lo que elige el usuario. Con fechas, el rango deja de ser «sin tocar»; vacío («Clear»), vuelve a serlo. */
  setDateRange: (value: DateRange | undefined) => void
  /**
   * True mientras el usuario no eligió fechas (al entrar, al recargar y después de «Clear» o de un reset).
   * Expenses List lo usa para mostrar los 7 días hasta hoy sin pisar un rango elegido
   * (plans/plan-expenses-rango-hoy).
   */
  dateRangeIsDefault: boolean
  /** Vuelve al rango por defecto (7 días hasta ayer) como «sin tocar». */
  resetDateRange: () => void
  /** Pone un rango sin marcarlo como elegido: el default propio de una pantalla. */
  showDefaultDateRange: (value: DateRange | undefined) => void
  /** Invoice list: legacy-style period bounds (fecha_desde / fecha_hasta on statement). */
  invoiceDateFrom: Date | undefined
  invoiceDateTo: Date | undefined
  setInvoiceDateFrom: (value: Date | undefined) => void
  setInvoiceDateTo: (value: Date | undefined) => void
  /**
   * Cómo se eligió el período de Invoices: rango, «From» (de un día hasta hoy) o «Until» (hasta un
   * día, desde 01/01/2015). Las fechas de arriba ya vienen resueltas; esto solo dice qué mostrar en
   * el botón. En memoria, como las fechas: al recargar vuelve a `range` (plans/plan-payroll-spend §1 bis).
   */
  invoiceDateMode: InvoiceDateMode
  setInvoiceDateMode: (value: InvoiceDateMode) => void
  /**
   * «Ignore date range» del listado de invoices. Vive acá y no en la pantalla porque el
   * control que lo prende está en el header, que es hermano de la página, no hijo.
   */
  invoiceIgnorePeriod: boolean
  setInvoiceIgnorePeriod: (value: boolean) => void
  /**
   * Aviso de un solo uso para Invoices: «View in Invoices» de WO to be Billed lo prende antes de navegar, y la pantalla
   * de Invoices, al abrirse con él, arranca mostrando también las invoices de $0 y lo apaga
   * (plans/plan-wo-to-be-billed-v0, §5).
   */
  invoiceShowZeroOnce: boolean
  setInvoiceShowZeroOnce: (value: boolean) => void
  /**
   * WO to be Billed: su propio dealer (de a uno) y su rango, aparte de los del resto de las pantallas, con la memoria de
   * 30 minutos (`lib/filters/wo-header-memory.ts`). `woHeaderReady` es falso hasta que la pantalla entra
   * (`enterWoToBeBilled`), así no sale un pedido con lo de una visita vieja.
   */
  woDealers: string[]
  setWoDealers: (value: string[]) => void
  woDateRange: DateRange | undefined
  setWoDateRange: (value: DateRange | undefined) => void
  woHeaderReady: boolean
  enterWoToBeBilled: () => void
  leaveWoToBeBilled: () => void
  /**
   * «Generate Invoice» sin rango: sube el número y el encabezado abre el calendario (en celular, la hoja de filtros con el
   * calendario), para llevar a quien factura al campo que falta.
   */
  woDateRequest: number
  requestWoDate: () => void
  /** La pantalla lo publica cuando la búsqueda lo fuerza (invoice # o empleado). */
  invoiceIgnorePeriodLocked: boolean
  setInvoiceIgnorePeriodLocked: (value: boolean) => void
  /**
   * Income by Dealer: «By year» en el header cambia el calendario por un combo de años. Vive
   * aparte de `dateRange`: al volver a las otras pantallas el calendario sigue con sus fechas.
   */
  incomeYearMode: boolean
  setIncomeYearMode: (value: boolean) => void
  /** Años marcados en el combo (cualquier combinación, también salteados). */
  incomeYears: number[]
  setIncomeYears: (value: number[]) => void
  /**
   * Monthly Closing y Window Tint Closing: el mes del combo del header (`YYYY-MM`), en vez del calendario.
   * Por defecto el mes anterior de New York (el último cerrado); `''` si se borra (la pantalla pide elegir uno).
   */
  closingMonth: string
  setClosingMonth: (value: string) => void
  /**
   * Open Invoices: el domingo «As of» del header (`YYYY-MM-DD`), en vez del calendario de rango. Por defecto el último
   * domingo de New York (plans/plan-reporte-javier §4.3).
   */
  openInvoicesAsOf: string
  setOpenInvoicesAsOf: (value: string) => void
  /** True after client mount + cookie restore (safe for dealer-dependent UI). */
  filtersHydrated: boolean
  clearFilters: () => void
}

const FilterContext = createContext<FilterContextType | undefined>(undefined)

/** Referencia estable: evita re-render en cada pasada para el caso externo. */
const EMPTY_EXCLUDED: number[] = []

export function FilterProvider({ children }: { children: ReactNode }) {
  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const isExternal = Boolean(user?.isCompanyTypeCompany)
  // Sin el permiso, Fake GPS (8) no existe para este usuario: ni tarjeta, ni ⚠, ni
  // columna del ranking. Se resuelve acá para que ninguna pantalla lo pida.
  const canSeeFakeGps = canViewFakeGps(hasPermission, user?.isSystemAdmin)
  const allowedFlagTypes = useMemo(
    () => (canSeeFakeGps ? ALL_FLAG_TYPES : ALL_FLAG_TYPES.filter((t) => t !== 8)),
    [canSeeFakeGps],
  )
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
  // SIN cookie a propósito: dealers y tipos sí persisten, el estado no. Nadie tiene
  // que entrar al día siguiente viendo corregidos creyendo que ve pendientes.
  const [errorStatusState, setErrorStatus] = useState<ErrorStatus>(DEFAULT_ERROR_STATUS)
  const [excludedErrorTypesState, setExcludedErrorTypesState] = useState<number[]>([])
  const [selectedTodayLiveStatus, setSelectedTodayLiveStatus] =
    useState<TodayLiveStatusFilter>(TODAY_LIVE_STATUS_ALL)
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(undefined)
  const [dateRangeIsDefault, setDateRangeIsDefault] = useState(true)
  const [invoiceDateFrom, setInvoiceDateFrom] = useState<Date | undefined>(undefined)
  const [invoiceDateTo, setInvoiceDateTo] = useState<Date | undefined>(undefined)
  const [invoiceDateMode, setInvoiceDateMode] = useState<InvoiceDateMode>('range')
  const [invoiceShowZeroOnce, setInvoiceShowZeroOnce] = useState(false)
  // El dealer de las otras pantallas, para WO to be Billed al entrar (sin rehacer `enterWoToBeBilled`).
  const selectedDealersRef = useRef<string[]>([])
  useEffect(() => {
    selectedDealersRef.current = selectedDealers
  }, [selectedDealers])

  const [woDealers, setWoDealersState] = useState<string[]>([])
  const [woDateRange, setWoDateRangeState] = useState<DateRange | undefined>(undefined)
  const [woHeaderReady, setWoHeaderReady] = useState(false)
  const [woDateRequest, setWoDateRequest] = useState(0)
  const requestWoDate = useCallback(() => setWoDateRequest((n) => n + 1), [])
  // Lo último elegido, para guardarlo con la hora sin depender del render.
  const woHeaderRef = useRef<{ dealer: string | null; from: string | null; to: string | null }>({ dealer: null, from: null, to: null })
  const saveWoHeader = useCallback((next: { dealer: string | null; from: string | null; to: string | null }) => {
    woHeaderRef.current = next
    writeWoHeaderMemory(typeof window !== 'undefined' ? window.localStorage : undefined, next, Date.now())
  }, [])
  const setWoDealers = useCallback(
    (value: string[]) => {
      const one = value.length ? [value[value.length - 1]] : []
      setWoDealersState(one)
      saveWoHeader({ ...woHeaderRef.current, dealer: one[0] ?? null })
    },
    [saveWoHeader],
  )
  const setWoDateRange = useCallback(
    (value: DateRange | undefined) => {
      // Un solo día elegido = desde y hasta ese día.
      const range = value?.from ? { from: value.from, to: value.to ?? value.from } : undefined
      setWoDateRangeState(range)
      saveWoHeader({ ...woHeaderRef.current, from: toYmd(range?.from), to: toYmd(range?.to) })
    },
    [saveWoHeader],
  )
  const enterWoToBeBilled = useCallback(() => {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined
    const next = woHeaderOnEntry(selectedDealersRef.current, readWoHeaderMemory(storage), Date.now())
    setWoDealersState(next.dealer ? [next.dealer] : [])
    const from = fromYmd(next.from)
    setWoDateRangeState(from ? { from, to: fromYmd(next.to) ?? from } : undefined)
    saveWoHeader(next)
    setWoHeaderReady(true)
  }, [saveWoHeader])
  const leaveWoToBeBilled = useCallback(() => {
    // La «última vez» es cuando se deja la pantalla.
    saveWoHeader(woHeaderRef.current)
    setWoHeaderReady(false)
  }, [saveWoHeader])
  const [invoiceIgnorePeriod, setInvoiceIgnorePeriod] = useState(false)
  const [invoiceIgnorePeriodLocked, setInvoiceIgnorePeriodLocked] = useState(false)
  const [incomeYearMode, setIncomeYearMode] = useState(false)
  const [incomeYears, setIncomeYears] = useState<number[]>([])
  const [closingMonth, setClosingMonth] = useState<string>(() => defaultClosingMonth())
  const [openInvoicesAsOf, setOpenInvoicesAsOf] = useState<string>(() => lastSundayNyYmd())
  const [filtersHydrated, setFiltersHydrated] = useState(false)

  const showDefaultDateRange = useCallback((value: DateRange | undefined) => {
    setDateRangeState(value)
    if (!isTodayOnlyDateRange(value)) {
      setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    }
  }, [])

  const setDateRange = useCallback((value: DateRange | undefined) => {
    showDefaultDateRange(value)
    // «Clear» del calendario deja el rango vacío como siempre, pero vuelve a «sin tocar».
    setDateRangeIsDefault(!value?.from)
  }, [showDefaultDateRange])

  const resetDateRange = useCallback(() => {
    showDefaultDateRange(getDefaultDateRange())
    setDateRangeIsDefault(true)
  }, [showDefaultDateRange])

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
  // Mismo patrón que la línea de arriba, por el mismo motivo.
  const errorStatus: ErrorStatus = isExternal ? DEFAULT_ERROR_STATUS : errorStatusState
  const includedErrorTypes = useMemo(
    () => includedErrorTypesFrom(excludedErrorTypes, allowedFlagTypes),
    [excludedErrorTypes, allowedFlagTypes],
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
    resetDateRange()
    setInvoiceDateFrom(def.from)
    setInvoiceDateTo(def.to)
    setInvoiceDateMode('range')
  }, [resetDateRange])

  const clearFilters = () => {
    setSearch('')
    setSelectedEmployee(null)
    writeSelectedDealersCookie([])
    setSelectedDealersState([])
    setDealerIdAllowList(null)
    setSelectedDealer('all')
    setSelectedType('all')
    setErrorStatus(DEFAULT_ERROR_STATUS)
    setExcludedErrorTypesState([])
    setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    const def = getDefaultDateRange()
    resetDateRange()
    setInvoiceDateFrom(def.from)
    setInvoiceDateTo(def.to)
    setInvoiceDateMode('range')
    setInvoiceIgnorePeriod(false)
    setClosingMonth(defaultClosingMonth())
    setOpenInvoicesAsOf(lastSundayNyYmd())
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
      errorStatus,
      setErrorStatus,
      excludedErrorTypes,
      allowedFlagTypes,
      includedErrorTypes,
      toggleErrorType,
      resetErrorTypes,
      errorTypesReady,
      selectedTodayLiveStatus,
      setSelectedTodayLiveStatus,
      dateRange,
      setDateRange,
      dateRangeIsDefault,
      resetDateRange,
      showDefaultDateRange,
      invoiceDateFrom,
      invoiceDateTo,
      setInvoiceDateFrom,
      setInvoiceDateTo,
      invoiceDateMode,
      setInvoiceDateMode,
      invoiceIgnorePeriod,
      setInvoiceIgnorePeriod,
      invoiceShowZeroOnce,
      setInvoiceShowZeroOnce,
      woDealers,
      setWoDealers,
      woDateRange,
      setWoDateRange,
      woHeaderReady,
      enterWoToBeBilled,
      leaveWoToBeBilled,
      woDateRequest,
      requestWoDate,
      invoiceIgnorePeriodLocked,
      setInvoiceIgnorePeriodLocked,
      incomeYearMode,
      setIncomeYearMode,
      incomeYears,
      setIncomeYears,
      closingMonth,
      setClosingMonth,
      openInvoicesAsOf,
      setOpenInvoicesAsOf,
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
