'use client'

import * as React from 'react'
import type { ColumnDef, ColumnPinningState, SortingState } from '@tanstack/react-table'
import {
  AlertTriangle,
  CheckCheck,
  CheckCircle,
  Images,
  Info,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { usePunchListInfinite } from '@/hooks/use-punch-list-infinite'
import { useFilters } from '@/lib/filter-context'
import { errorTypesQueryKey } from '@/lib/filters/error-types-cookie'
import { isErrorIssueType, punchErrorVisible, punchLacksPaymentType } from '@/lib/ttk/error-type-meta'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import {
  buildPunchListParams,
  type PunchListSort,
} from '@/lib/ttk/punch-list-filters'
import {
  formatDurationDisplay,
  formatGmtDate,
  formatGmtTime,
} from '@/lib/ttk/map-header-filters'
import { formatPunchDurationDisplay } from '@/lib/ttk/format-grouped-hours'
import { formatUsDateForExport, formatUsTimeForExport } from '@/lib/format-us-datetime'
import type { TtkListRow } from '@/lib/ttk/ttk-list-types'
import { EmployeeThumbnail } from '@/components/ttk/employee-thumbnail'
import { PunchErrorIndicator } from '@/components/ttk/punch-error-indicator'
import { PunchTimeCell } from '@/components/ttk/punch-time-cell'
import {
  breakEndMethod,
  breakStartMethod,
  formatMethodForExport,
  hasFaceValidationPhotos,
  punchInMethod,
  punchOutMethod,
} from '@/lib/ttk/punch-method'
import {
  buildPunchFacePhotoValidation,
  PunchFacePhotosDialog,
} from '@/components/ttk/punch-face-photos-dialog'
import { PunchFixedIndicator } from '@/components/ttk/punch-fixed-indicator'
import { PunchManualIndicator } from '@/components/ttk/punch-manual-indicator'
import { EditPunchDialog } from '@/components/ttk/edit-punch-dialog'
import { PunchLogDialog } from '@/components/ttk/punch-log-dialog'
import { PunchHoursFilter } from '@/components/ttk/punch-hours-filter'
import { PaymentTypeFilter } from '@/components/ttk/payment-type-filter'
import { PunchListExportButton } from '@/components/ttk/punch-list-export-button'
import { PaymentTypeCell } from '@/components/ttk/payment-type-cell'
import { EditPaymentTypeDialog, type EditPaymentTypeTarget } from '@/components/ttk/edit-payment-type-dialog'
import { Button } from '@/components/ui/button'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import {
  canAddOrEditPunch,
  canDeletePunch,
  canEditPaymentType,
  canViewPaymentType,
} from '@/lib/auth/ttk-permissions'
import { useTtkDeletePunch } from '@/hooks/use-ttk-delete-punch'
import { usePaymentTypesCatalog } from '@/hooks/use-payment-types-catalog'
import {
  PAYMENT_TYPE_FILTER_ALL,
  type PaymentTypeFilterValue,
} from '@/lib/ttk/payment-type-filter'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { toast } from 'sonner'
import { PunchDeleteConfirmDialog } from '@/components/ttk/punch-delete-confirm-dialog'
import { useMinWidth } from '@/hooks/use-mobile'
import { useTranslation } from '@/lib/i18n/locale-context'

import type { DateRange } from 'react-day-picker'
import { effectiveErrorStatus, resolveIssueType } from '@/lib/ttk/error-status'
import { PunchDeletedChip, PunchFixChips } from '@/components/ttk/punch-fix-chips'

/** Pin Employee / Actions only at this width and above. */
const TABLE_PIN_MIN_WIDTH = 1200

/** Referencia estable para el vacío: evita re-render por identidad nueva. */
const EMPTY_ROWS: TtkListRow[] = []

export type IssuesDataTableProps = {
  /** Overrides header date range (e.g. dashboard yesterday-only). */
  dateRangeOverride?: DateRange
  /** Overrides header issue-type filter. */
  issueTypeOverride?: string
  /** When true, ignores header search text. */
  ignoreSearch?: boolean
  /** When set, filters punches to this employee (e.g. grouped row expand). */
  employeeIdOverride?: number
  /**
   * Frontera congelada del grupo padre (expansión de Grouped y su export). Sin
   * ella, expandir un grupo muestra ponchadas que no estaban en el padre.
   */
  snapshotAt?: string
  tableId?: string
  defaultPageSize?: number
  exportFileName?: string
  queryKeySuffix?: string
  /**
   * Max-height of the scroll container. Enables sticky header.
   * Defaults to `calc(100dvh - 24rem)` which fits the issues page layout
   * (nav 4rem + padding + title + KPI cards + toolbar ≈ 24rem).
   * Pass `false` to disable (page scrolls, no sticky header).
   */
  tableScrollHeight?: string | false
  /** Controlled shift-duration filters (optional; defaults to internal state). */
  punchMinHoursRaw?: string
  punchMaxHoursRaw?: string
  paymentTypeFilter?: PaymentTypeFilterValue
  onPaymentTypeFilterChange?: (value: PaymentTypeFilterValue) => void
  /** When false, hours/payment filters live in PunchReportFilterPanel only. */
  showToolbarFilters?: boolean
  /** When false, hides the toolbar export button (e.g. nested grouped detail). */
  enableExport?: boolean
  /** When false, hides the full-screen table focus control (e.g. nested grouped detail). */
  enableTableFocus?: boolean
  /**
   * Barra de herramientas propia (`Rows` + `Columns`). En el 2do nivel de
   * Grouped se apaga: son los mismos dos controles que ya tiene la tabla padre
   * justo arriba, repetidos adentro de cada fila expandida.
   */
  enableToolbarControls?: boolean
  /** When set, timeWork/timeBreak follow the grouped hrs/decimal toggle. */
  groupedHoursFormat?: boolean
  /**
   * When false, hides the "already corrected" chip next to the record count.
   * En Grouped el aviso va UNA vez, en la tabla padre: repetirlo en cada grupo
   * expandido lo convierte en ruido y lo aleja del contador que califica.
   */
  showCorrectedNote?: boolean
}

/**
 * Chip «ya corregidas» que va al lado del contador de filas.
 *
 * Vive acá y se exporta porque lo usan las dos grillas: en Individual lo pone
 * esta tabla, y en Grouped lo pone la tabla PADRE —el aviso califica al total de
 * empleados listados, no a cada grupo abierto—. Duplicar el markup terminaba en
 * dos chips que se parecían pero no eran iguales.
 */
export function CorrectedRecordsNote() {
  const { t } = useTranslation()
  return (
    <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
      <CheckCheck className="size-3" />
      {t('punch.viewingCorrectedNote')}
    </span>
  )
}

/**
 * Columna de la grilla -> clave del endpoint. **Es el contrato entero.**
 *
 * Vive a nivel de MODULO a proposito: `listParams` se arma antes que `columns`,
 * asi que leer `columns` desde ese memo tocaria una const sin inicializar y
 * revienta en runtime. Lo leen los dos —el memo de params y las columnas, que
 * copian de aca su `meta.sortKey`— y no hay dependencia de orden porque no hay
 * ninguna variable del componente en el medio.
 *
 * `date` y `punchIn` comparten clave A PROPOSITO: la columna Date muestra la
 * fecha de `punch_in` y la columna Punch in su hora, asi que ordenar por
 * cualquiera de las dos ordena por el mismo instante.
 *
 * Una columna que no esta aca va con `enableSorting: false`. Antes esta funcion
 * devolvia `punchIn` para TODO lo que no fuera `employee`, y por eso ordenar
 * por Time break ordenaba por hora de entrada (BUG-07).
 */
export const PUNCH_LIST_SORT_BY_COLUMN_ID: Record<string, PunchListSort> = {
  employee: 'employee',
  date: 'punchIn',
  punchIn: 'punchIn',
  breakStart: 'breakStart',
  breakEnd: 'breakEnd',
  punchOut: 'punchOut',
  timeWork: 'timeWork',
  timeBreak: 'timeBreak',
  paymentType: 'paymentType',
}

/** Orden inicial visible. El estado vacio se normaliza a esto (§4.3.8). */
const PUNCH_LIST_DEFAULT_SORTING: SortingState = [{ id: 'date', desc: true }]

function mapPunchListSort(sorting: SortingState): PunchListSort {
  const id = sorting[0]?.id
  if (!id) return 'punchIn'
  const key = PUNCH_LIST_SORT_BY_COLUMN_ID[id]
  if (!key) {
    // No degradar en silencio: BUG-07 nacio justamente de un mapeo que lo hacia.
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Columna sin sortKey en PUNCH_LIST_SORT_BY_COLUMN_ID: ${id}`)
    }
    return 'punchIn'
  }
  return key
}

function mapPunchListDir(sorting: SortingState): 'asc' | 'desc' {
  const first = sorting[0]
  if (!first) return 'desc'
  return first.desc ? 'desc' : 'asc'
}

function roleLabel(row: TtkListRow): string {
  if (!row.rolDpto) return ''
  const parts = [row.rolDpto.role, row.rolDpto.department].filter(Boolean)
  return parts.join(' / ')
}

function formatTimeWorkBreak(
  row: TtkListRow,
  field: 'work' | 'break',
  groupedHoursFormat?: boolean,
): string {
  const duration = field === 'work' ? row.timeWork : row.timeBreak
  if (groupedHoursFormat === undefined) {
    return formatDurationDisplay(duration) || '—'
  }
  const decimal = field === 'work' ? row.numberWork : row.numberBrake
  return formatPunchDurationDisplay(duration, decimal ?? null, groupedHoursFormat)
}

export function IssuesDataTable({
  dateRangeOverride,
  issueTypeOverride,
  ignoreSearch = false,
  employeeIdOverride,
  snapshotAt,
  tableId = 'issues-punches',
  defaultPageSize = 25,
  exportFileName = 'punch-issues',
  queryKeySuffix = 'issues',
  tableScrollHeight,
  punchMinHoursRaw: punchMinHoursRawProp,
  punchMaxHoursRaw: punchMaxHoursRawProp,
  paymentTypeFilter: paymentTypeFilterProp,
  onPaymentTypeFilterChange,
  showToolbarFilters = true,
  enableExport = true,
  enableTableFocus = true,
  enableToolbarControls = true,
  groupedHoursFormat,
  showCorrectedNote = true,
}: IssuesDataTableProps = {}) {
  const { t } = useTranslation()
  // Dynamic scroll height: fills the available viewport below the fixed nav,
  // DataTable toolbar, and page bottom padding.
  // Updates on window resize so it works on every screen size.
  const [computedScrollHeight, setComputedScrollHeight] = React.useState<string | undefined>(undefined)
  React.useLayoutEffect(() => {
    const NAV_H = 64      // dashboard nav h-16
    const TOOLBAR_H = 40  // DataTable toolbar row
    const BOTTOM_PAD = 24  // page p-6 bottom padding

    const compute = () => {
      const h = window.innerHeight - NAV_H - TOOLBAR_H - BOTTOM_PAD
      setComputedScrollHeight(h > 200 ? `${h}px` : undefined)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  // Prop overrides: string = explicit height, false = disable, undefined = dynamic
  const effectiveScrollHeight: string | undefined =
    tableScrollHeight === false
      ? undefined
      : typeof tableScrollHeight === 'string'
      ? tableScrollHeight
      : computedScrollHeight

  const {
    search,
    selectedEmployee,
    selectedDealers,
    selectedType,
    setSelectedType,
    errorStatus,
    selectedTodayLiveStatus,
    dateRange,
    filtersHydrated,
    includedErrorTypes: storedIncludedErrorTypes,
    allowedFlagTypes,
    errorTypesReady,
  } = useFilters()



  const effectiveDateRange = dateRangeOverride ?? dateRange
  const effectiveSelectedType = issueTypeOverride ?? selectedType
  const effectiveSearch = ignoreSearch ? '' : search

  /**
   * La lista blanca sólo rige cuando el pedido filtra por error. Con `all` la
   * tabla lista todas las ponchadas y las tres tarjetas están inactivas, así que
   * no filtra ni apaga ningún ⚠.
   */
  // El gate mira el issueType YA CRUZADO con el estado: en modo corregido el
  // EXISTS del backend respeta los tipos tildados, así que la lista blanca rige.
  const crossedIssueType = resolveIssueType(effectiveSelectedType, errorStatus)
  const isCorrectedMode = effectiveErrorStatus(effectiveSelectedType, errorStatus) === 'corrected'
  const includedErrorTypes = isErrorIssueType(crossedIssueType)
    ? storedIncludedErrorTypes
    : allowedFlagTypes
  const emptyByErrorTypes = includedErrorTypes.length === 0

  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [sorting, setSortingState] = React.useState<SortingState>(PUNCH_LIST_DEFAULT_SORTING)
  /**
   * «Clear sort» del menu deja `sorting = []`, y con eso el backend igual ordena
   * por su default (`punchIn DESC`) pero NINGUN encabezado queda marcado: la
   * lista esta ordenada y ninguna flecha lo dice, que es justo lo que D-4
   * prohibe. Se normaliza el estado vacio al orden inicial VISIBLE.
   */
  const setSorting = React.useCallback<React.Dispatch<React.SetStateAction<SortingState>>>(
    (next) =>
      setSortingState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        return resolved.length === 0 ? PUNCH_LIST_DEFAULT_SORTING : resolved
      }),
    [],
  )
  const [punchMinHoursRawInternal, setPunchMinHoursRawInternal] = React.useState('')
  const [punchMaxHoursRawInternal, setPunchMaxHoursRawInternal] = React.useState('')
  const punchMinHoursRaw = punchMinHoursRawProp ?? punchMinHoursRawInternal
  const punchMaxHoursRaw = punchMaxHoursRawProp ?? punchMaxHoursRawInternal
  const setPunchMinHoursRaw = punchMinHoursRawProp !== undefined ? () => {} : setPunchMinHoursRawInternal
  const setPunchMaxHoursRaw = punchMaxHoursRawProp !== undefined ? () => {} : setPunchMaxHoursRawInternal
  const debouncedMinHours = useDebouncedValue(punchMinHoursRaw, 600)
  const debouncedMaxHours = useDebouncedValue(punchMaxHoursRaw, 600)
  const punchMinHours = debouncedMinHours !== '' ? Number(debouncedMinHours) : null
  const punchMaxHours = debouncedMaxHours !== '' ? Number(debouncedMaxHours) : null
  const [paymentTypeFilterInternal, setPaymentTypeFilterInternal] =
    React.useState<PaymentTypeFilterValue>(PAYMENT_TYPE_FILTER_ALL)
  const paymentTypeFilter = paymentTypeFilterProp ?? paymentTypeFilterInternal
  const setPaymentTypeFilter = onPaymentTypeFilterChange ?? setPaymentTypeFilterInternal
  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const canViewPayment = canViewPaymentType(hasPermission, user?.isSystemAdmin)

  const { data: paymentTypeOptions = [], isLoading: paymentTypesLoading } =
    usePaymentTypesCatalog(
      filtersHydrated && canViewPayment && !meLoading && showToolbarFilters,
    )

  // Espejo del de issues/page.tsx. El guard `showToolbarFilters` es lo que
  // impide que el 2do nivel de Grouped mueva el radio de la pagina: ahi vale
  // false. Igual que alla, SIN rama `else` (D-6, PLAN.md 4.2.2bis).
  React.useEffect(() => {
    if (!canViewPayment || !showToolbarFilters) return
    if (effectiveSelectedType === 'without_salary') {
      setPaymentTypeFilter(PAYMENT_TYPE_FILTER_ALL)
    }
  }, [effectiveSelectedType, canViewPayment, showToolbarFilters, setPaymentTypeFilter])

  const handlePaymentTypeFilterChange = React.useCallback(
    (next: PaymentTypeFilterValue) => {
      setPaymentTypeFilter(next)
      if (
        next.ids.length > 0 &&
        (selectedType === 'without_salary' || effectiveSelectedType === 'without_salary')
      ) {
        setSelectedType('all')
      }
    },
    [effectiveSelectedType, selectedType, setSelectedType, setPaymentTypeFilter],
  )
  const [thumbnailOverrides, setThumbnailOverrides] = React.useState<
    Record<string, string>
  >({})
  const [editingPunch, setEditingPunch] = React.useState<{
    id: number | string
    employeeName: string
    punchIn?: string | null
    breakStart?: string | null
    breakEnd?: string | null
    punchOut?: string | null
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{
    id: number | string
    employeeName: string
    punchDateLabel: string
    action: 'delete' | 'activate'
  } | null>(null)
  const [logTarget, setLogTarget] = React.useState<{
    id: number | string
    employeeName: string
    punchDateLabel: string
  } | null>(null)
  const [photoTarget, setPhotoTarget] = React.useState<{
    employeeName: string
    punchDateLabel: string
    validation: ReturnType<typeof buildPunchFacePhotoValidation>
  } | null>(null)
  const [paymentTypeTarget, setPaymentTypeTarget] =
    React.useState<EditPaymentTypeTarget | null>(null)

  const deleteMutation = useTtkDeletePunch()
  const canEdit = canAddOrEditPunch(hasPermission, user?.isSystemAdmin)
  const canDelete = canDeletePunch(hasPermission, user?.isSystemAdmin)
  const canEditPayment = canEditPaymentType(hasPermission, user?.isSystemAdmin)
  const showActions = !meLoading && !user?.isCompanyTypeCompany
  const effectivePaymentTypeFilter: PaymentTypeFilterValue = canViewPayment
    ? paymentTypeFilter
    : PAYMENT_TYPE_FILTER_ALL
  const isWideScreen = useMinWidth(TABLE_PIN_MIN_WIDTH)

  const debouncedDealers = useDebouncedValue(selectedDealers, 450)
  const debouncedSearch = useDebouncedValue(search, 300)

  const listParams = React.useMemo(
    () =>
      buildPunchListParams({
        search: effectiveSearch,
        selectedDealers: debouncedDealers,
        dateRange: effectiveDateRange,
        selectedType: effectiveSelectedType,
        selectedEmployeeId: employeeIdOverride ?? selectedEmployee?.id ?? null,
        pageSize,
        sort: mapPunchListSort(sorting),
        dir: mapPunchListDir(sorting),
        minHours: punchMinHours,
        maxHours: punchMaxHours,
        paymentTypeFilter: effectivePaymentTypeFilter,
        todayLiveStatus: selectedTodayLiveStatus,
        includedErrorTypes,
        errorStatus,
        snapshotAt,
      }),
    [
      effectiveSearch,
      debouncedDealers,
      effectiveDateRange,
      effectiveSelectedType,
      selectedEmployee?.id,
      employeeIdOverride,
      pageSize,
      sorting,
      punchMinHours,
      punchMaxHours,
      effectivePaymentTypeFilter,
      selectedTodayLiveStatus,
      includedErrorTypes,
      errorStatus,
      snapshotAt,
    ],
  )

  const queryEnabled =
    filtersHydrated &&
    errorTypesReady &&
    !emptyByErrorTypes &&
    debouncedDealers.length > 0 &&
    Boolean(listParams.fechaDesde) &&
    Boolean(listParams.fechaHasta)

  const getEmployeeId = React.useCallback(
    (row: TtkListRow) => Number(row.usuario?.id ?? 0),
    [],
  )

  const getThumbnailUuid = React.useCallback(
    (row: TtkListRow) => {
      const id = String(row.usuario?.id ?? '')
      if (id && thumbnailOverrides[id]) return thumbnailOverrides[id]
      return row.usuario?.thumbnailUuid ?? null
    },
    [thumbnailOverrides],
  )

  const handleThumbnailSaved = React.useCallback((employeeId: number, uuid: string) => {
    setThumbnailOverrides((prev) => ({ ...prev, [String(employeeId)]: uuid }))
  }, [])

  const columns = React.useMemo<ColumnDef<TtkListRow>[]>(() => {
    const defs: ColumnDef<TtkListRow>[] = [
      {
        id: 'employee',
        accessorFn: (row) => row.usuario?.nombre ?? '',
        size: 280,
        minSize: 200,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('common.employee')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex min-w-0 items-center gap-2">
              <EmployeeThumbnail
                employeeId={getEmployeeId(r)}
                employeeName={r.usuario?.nombre ?? '—'}
                thumbnailUuid={getThumbnailUuid(r)}
                onSaved={(uuid) => handleThumbnailSaved(getEmployeeId(r), uuid)}
                size="sm"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">
                    {r.usuario?.nombre ?? '—'}
                  </span>
                  {punchErrorVisible(r, includedErrorTypes) ? (
                    <PunchErrorIndicator
                      errorText={r.badPunch?.res?.trim() || ''}
                      fakeGpsEvents={
                        includedErrorTypes.includes(8) ? r.fakeGpsEvents : undefined
                      }
                      withoutSalary={
                        includedErrorTypes.includes(4) && punchLacksPaymentType(r)
                      }
                    />
                  ) : null}
                  {Number(r.manualCreate) === 1 ? <PunchManualIndicator /> : null}
                  {r.fixedAt ? (
                    <PunchFixedIndicator
                      fixedAt={r.fixedAt}
                      fixedByName={r.fixedBy?.nombre}
                      errorSnapshot={r.fixedErrorSnapshot}
                    />
                  ) : null}
                  {/*
                    Un chip por EVENTO de corrección. `estado` ya viajaba en el DTO:
                    en modo Corrected una ponchada borrada sigue en la lista y hay
                    que decirlo en la fila.
                  */}
                  {isCorrectedMode ? <PunchFixChips fixes={r.fixes} /> : null}
                  {isCorrectedMode && Number(r.estado ?? 1) === 0 ? <PunchDeletedChip /> : null}
                </div>
                {r.dealer?.razonSocial ? (
                  <span className="truncate text-[10px] font-normal text-muted-foreground">
                    {r.dealer.razonSocial}
                  </span>
                ) : null}
              </div>
            </div>
          )
        },
        meta: {
          label: t('common.employee'),
          pin: 'left',
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.employee,
          exportValue: (r) => r.usuario?.nombre ?? '',
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'role',
        accessorFn: (row) => roleLabel(row),
        // D-9 — su valor es una subconsulta correlacionada del SELECT; el WHERE
        // del cursor no puede referenciar el alias, asi que habria que repetirla
        // dos veces mas por fila. Hoy la columna dice que ordena y NO ordena:
        // sacarle la flecha es cumplir BUG-07, no recortarlo.
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.roleDept')} />
        ),
        cell: ({ row }) => roleLabel(row.original) || '—',
        meta: {
          label: t('punch.roleDept'),
          exportValue: (r) => roleLabel(r),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'date',
        accessorFn: (row) => row.punchInGmt0 ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('common.date')} />
        ),
        cell: ({ row }) => formatGmtDate(row.original.punchInGmt0) || '—',
        meta: {
          label: t('common.date'),
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.date,
          exportValue: (r) => formatUsDateForExport(r.punchInGmt0),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'punchIn',
        accessorFn: (row) => row.punchInGmt0 ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.punchIn')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          const time = formatGmtTime(r.punchInGmt0)
          return (
            <PunchTimeCell time={time} method={time ? punchInMethod(r) : null} />
          )
        },
        meta: {
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.punchIn,
          label: t('punch.punchIn'),
          mono: true,
          exportValue: (r) => {
            const t = formatUsTimeForExport(r.punchInGmt0)
            return t ? t + formatMethodForExport(punchInMethod(r)) : ''
          },
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'breakStart',
        accessorFn: (row) => row.breakStartGmt0 ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.breakStart')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          const time = formatGmtTime(r.breakStartGmt0)
          return (
            <PunchTimeCell time={time} method={time ? breakStartMethod(r) : null} />
          )
        },
        meta: {
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.breakStart,
          label: t('punch.breakStart'),
          mono: true,
          exportValue: (r) => {
            const t = formatUsTimeForExport(r.breakStartGmt0)
            return t ? t + formatMethodForExport(breakStartMethod(r)) : ''
          },
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'breakEnd',
        accessorFn: (row) => row.breakEndGmt0 ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.breakEnd')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          const time = formatGmtTime(r.breakEndGmt0)
          return (
            <PunchTimeCell time={time} method={time ? breakEndMethod(r) : null} />
          )
        },
        meta: {
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.breakEnd,
          label: t('punch.breakEnd'),
          mono: true,
          exportValue: (r) => {
            const t = formatUsTimeForExport(r.breakEndGmt0)
            return t ? t + formatMethodForExport(breakEndMethod(r)) : ''
          },
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'punchOut',
        accessorFn: (row) => row.punchOutGmt0 ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.punchOut')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          const time = formatGmtTime(r.punchOutGmt0)
          return (
            <PunchTimeCell time={time} method={time ? punchOutMethod(r) : null} />
          )
        },
        meta: {
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.punchOut,
          label: t('punch.punchOut'),
          mono: true,
          exportValue: (r) => {
            const t = formatUsTimeForExport(r.punchOutGmt0)
            return t ? t + formatMethodForExport(punchOutMethod(r)) : ''
          },
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'timeWork',
        accessorFn: (row) => row.timeWork ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.timeWork')} />
        ),
        cell: ({ row }) => formatTimeWorkBreak(row.original, 'work', groupedHoursFormat),
        meta: {
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.timeWork,
          label: t('punch.timeWork'),
          mono: true,
          exportValue: (r) => formatTimeWorkBreak(r, 'work', groupedHoursFormat),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'timeBreak',
        accessorFn: (row) => row.timeBreak ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.timeBreak')} />
        ),
        cell: ({ row }) => formatTimeWorkBreak(row.original, 'break', groupedHoursFormat),
        meta: {
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.timeBreak,
          label: t('punch.timeBreak'),
          mono: true,
          exportValue: (r) => formatTimeWorkBreak(r, 'break', groupedHoursFormat),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
    ]

    if (canViewPayment) {
      defs.push({
        id: 'paymentType',
        accessorFn: (row) => row.objPaymentType?.name ?? '',
        size: 110,
        minSize: 90,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.paymentType')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          const editable =
            canEditPayment && Number(r.estado ?? 1) === 1
          return (
            <PaymentTypeCell
              name={r.objPaymentType?.name}
              editable={editable}
              onEdit={() =>
                setPaymentTypeTarget({
                  id: r.id,
                  employeeName: r.usuario?.nombre ?? '',
                  punchDateLabel: formatGmtDate(r.punchInGmt0) || '—',
                  idEmployee: Number(r.usuario?.id ?? 0),
                  idDealer: Number(r.dealer?.id ?? 0),
                  paymentTypeId: r.objPaymentType?.id ?? r.typePayment ?? null,
                  paymentTypeName: r.objPaymentType?.name ?? null,
                  hourlyRate: r.hourlyRate ?? null,
                })
              }
            />
          )
        },
        meta: {
          sortKey: PUNCH_LIST_SORT_BY_COLUMN_ID.paymentType,
          label: t('punch.paymentType'),
          exportValue: (r) => r.objPaymentType?.name ?? '',
        } satisfies DataTableColumnMeta<TtkListRow>,
      })
    }

    if (showActions) {
      defs.push({
        id: 'actions',
        size: 140,
        minSize: 112,
        maxSize: 180,
        enableSorting: false,
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('common.actions')}
            className="w-full justify-end pr-0 text-xs uppercase tracking-wide"
          />
        ),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center justify-end gap-0.5">
              {hasFaceValidationPhotos(r) ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer text-muted-foreground hover:bg-accent/10 hover:text-accent"
                  onClick={() =>
                    setPhotoTarget({
                      employeeName: r.usuario?.nombre ?? '',
                      punchDateLabel: formatGmtDate(r.punchInGmt0) || '—',
                      validation: buildPunchFacePhotoValidation(r),
                    })
                  }
                  aria-label={t('punch.viewFacePhotos', {
                    name: r.usuario?.nombre ?? t('common.employee'),
                  })}
                >
                  <Images className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {r.hasLog === 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer text-muted-foreground hover:bg-accent/10 hover:text-accent"
                  onClick={() =>
                    setLogTarget({
                      id: r.id,
                      employeeName: r.usuario?.nombre ?? '',
                      punchDateLabel: formatGmtDate(r.punchInGmt0) || '—',
                    })
                  }
                  aria-label={t('punch.viewChangeLog', {
                    name: r.usuario?.nombre ?? t('common.employee'),
                  })}
                >
                  <Info className="h-3.5 w-3.5" />
                </Button>
              )}
              {canEdit && Number(r.estado ?? 1) === 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  onClick={() =>
                    setEditingPunch({
                      id: r.id,
                      employeeName: r.usuario?.nombre ?? '',
                      punchIn: r.punchInGmt0,
                      breakStart: r.breakStartGmt0,
                      breakEnd: r.breakEndGmt0,
                      punchOut: r.punchOutGmt0,
                    })
                  }
                  aria-label={t('punch.editPunchFor', {
                    name: r.usuario?.nombre ?? t('common.employee'),
                  })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {canDelete &&
                (Number(r.estado ?? 1) === 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setDeleteTarget({
                        id: r.id,
                        employeeName: r.usuario?.nombre ?? 'employee',
                        punchDateLabel: formatGmtDate(r.punchInGmt0) || '—',
                        action: 'delete',
                      })
                    }
                    aria-label={t('punch.deletePunchFor', {
                      name: r.usuario?.nombre ?? t('common.employee'),
                    })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600"
                    onClick={() =>
                      setDeleteTarget({
                        id: r.id,
                        employeeName: r.usuario?.nombre ?? 'employee',
                        punchDateLabel: formatGmtDate(r.punchInGmt0) || '—',
                        action: 'activate',
                      })
                    }
                    aria-label={t('punch.activatePunchFor', {
                      name: r.usuario?.nombre ?? t('common.employee'),
                    })}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                  </Button>
                ))}
            </div>
          )
        },
        meta: {
          label: t('common.actions'),
          pin: 'right',
          headerClassName: 'min-w-[120px] text-right',
        } satisfies DataTableColumnMeta<TtkListRow>,
      })
    }

    return defs
  }, [
    showActions,
    canEdit,
    canDelete,
    canEditPayment,
    canViewPayment,
    getEmployeeId,
    getThumbnailUuid,
    handleThumbnailSaved,
    groupedHoursFormat,
    // Sin esto las celdas quedan con el closure viejo y el ⚠ no se apaga.
    includedErrorTypes,
    t,
  ])

  const columnPinning = React.useMemo<ColumnPinningState>(
    () => ({
      left: isWideScreen ? ['employee'] : [],
      right: isWideScreen && showActions ? ['actions'] : [],
    }),
    [isWideScreen, showActions],
  )

  const listQuery = usePunchListInfinite({
    queryKey: [
      'punch-list',
      queryKeySuffix,
      debouncedSearch,
      debouncedDealers.slice().sort().join(','),
      effectiveDateRange?.from?.toISOString(),
      effectiveDateRange?.to?.toISOString(),
      effectiveSelectedType,
      effectivePaymentTypeFilter,
      selectedTodayLiveStatus,
      employeeIdOverride,
      selectedEmployee?.id,
      punchMinHours,
      punchMaxHours,
      pageSize,
      listParams.sort,
      listParams.dir,
      errorTypesQueryKey(includedErrorTypes),
      // SIN esto la grilla no se entera del switch: `effectiveSelectedType` no
      // cambia al pasar de pendientes a corregidos (sigue siendo `only_error`),
      // así que react-query daba por buena la página cacheada y no volvía a pedir.
      // Es el issueType YA CRUZADO, que es lo que de verdad viaja al backend.
      crossedIssueType,
    ],
    enabled: queryEnabled,
    params: listParams,
    staleTime: 2 * 60 * 1000,
  })

  // Deshabilitar la query NO alcanza: `useDataTableQuery`/react-query conservan
  // `placeholderData: keepPreviousData`, así que sin descartar el resultado acá
  // quedarían pintadas las filas del universo anterior.
  const rows = emptyByErrorTypes ? EMPTY_ROWS : listQuery.rows
  const total = emptyByErrorTypes ? 0 : listQuery.total
  const isFetching = emptyByErrorTypes ? false : listQuery.isFetching
  const error =
    listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.error
        ? String(listQuery.error)
        : null

  const onLoadMore = React.useCallback(() => {
    void listQuery.fetchNextPage()
  }, [listQuery.fetchNextPage])

  const confirmDeletePunch = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({
        id_ttk: deleteTarget.id,
        action: deleteTarget.action,
      })
      toast.success(
        deleteTarget.action === 'activate'
          ? t('punch.restored', { name: deleteTarget.employeeName })
          : t('punch.deleted', { name: deleteTarget.employeeName }),
      )
      setDeleteTarget(null)
    } catch (e: unknown) {
      toast.error(getSrsErrorMessage(e, t('punch.deleteFailed')))
    }
  }

  const emptyState = !filtersHydrated ? (
    <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
  ) : selectedDealers.length === 0 ? (
    <span className="text-xs text-muted-foreground">
      {t('punch.loadFiltersFirst')}
    </span>
  ) : (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <AlertTriangle className="h-8 w-8 opacity-20" />
      <span className="text-xs">{t('punch.noRecordsForFilters')}</span>
    </div>
  )

  return (
    <>
      <div className="min-w-0">
        {error ? (
          <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <DataTable<TtkListRow>
          tableId={tableId}
          columns={columns}
          columnPinning={columnPinning}
          data={rows}
          getRowId={(row) => String(row.id)}
          isLoading={queryEnabled && isFetching && rows.length === 0}
          emptyState={emptyState}
          enableGlobalFilter={false}
          recordsCount={queryEnabled ? total : 0}
          recordsCountLabel={t('punch.issues')}
          // Sin esto, la grilla en modo corregido se lee igual que la de
          // pendientes: mismas columnas, mismas filas, y nada que diga que lo
          // que estás viendo son ponchadas que YA se arreglaron.
          recordsCountNote={
            isCorrectedMode && showCorrectedNote ? <CorrectedRecordsNote /> : null
          }
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          showPageSizeInInfiniteScroll={enableToolbarControls}
          pageSizeOptions={[25]}
          includeAllPageSize
          infiniteScroll={{
            hasNextPage: queryEnabled ? (listQuery.hasNextPage ?? false) : false,
            isFetchingNextPage: listQuery.isFetchingNextPage,
            onLoadMore,
            loadingLabel: (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t('invoices.loadingMore')}
              </>
            ),
          }}
          virtualizeThreshold={25}
          toolbarLeading={
            showToolbarFilters ? (
              <div className="flex flex-wrap items-center gap-3">
                <PunchHoursFilter
                  minHours={punchMinHoursRaw}
                  maxHours={punchMaxHoursRaw}
                  onMinChange={setPunchMinHoursRaw}
                  onMaxChange={setPunchMaxHoursRaw}
                />
                {canViewPayment && !meLoading ? (
                  <PaymentTypeFilter
                    value={paymentTypeFilter}
                    onChange={handlePaymentTypeFilterChange}
                    options={paymentTypeOptions}
                    loading={paymentTypesLoading}
                  />
                ) : null}
              </div>
            ) : undefined
          }
          enableViewOptions={enableToolbarControls}
          enableExport={false}
          toolbarTrailing={
            enableExport ? (
              <PunchListExportButton params={listParams} enabled={queryEnabled} />
            ) : undefined
          }
          exportFileName={exportFileName}
          manualSorting
          sorting={sorting}
          onSortingChange={setSorting}
          manualFiltering
          tableScrollHeight={effectiveScrollHeight}
          enableTableFocus={enableTableFocus}
        />
      </div>

      <PunchFacePhotosDialog
        open={photoTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPhotoTarget(null)
        }}
        employeeName={photoTarget?.employeeName}
        punchDateLabel={photoTarget?.punchDateLabel}
        validation={photoTarget?.validation ?? null}
      />

      <PunchLogDialog
        open={logTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLogTarget(null)
        }}
        punchId={logTarget?.id ?? null}
        employeeName={logTarget?.employeeName}
        punchDateLabel={logTarget?.punchDateLabel}
      />

      {canEdit && (
        <EditPunchDialog
          open={editingPunch !== null}
          onOpenChange={(open) => {
            if (!open) setEditingPunch(null)
          }}
          punchId={editingPunch?.id ?? null}
          employeeName={editingPunch?.employeeName}
          initial={
            editingPunch
              ? {
                  punchIn: editingPunch.punchIn,
                  breakStart: editingPunch.breakStart,
                  breakEnd: editingPunch.breakEnd,
                  punchOut: editingPunch.punchOut,
                }
              : undefined
          }
        />
      )}

      {canEditPayment && (
        <EditPaymentTypeDialog
          open={paymentTypeTarget !== null}
          onOpenChange={(open) => {
            if (!open) setPaymentTypeTarget(null)
          }}
          target={paymentTypeTarget}
        />
      )}

      <PunchDeleteConfirmDialog
        target={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onConfirm={confirmDeletePunch}
        pending={deleteMutation.isPending}
      />
    </>
  )
}
