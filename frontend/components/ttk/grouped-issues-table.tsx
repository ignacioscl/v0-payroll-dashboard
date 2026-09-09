'use client'

import * as React from 'react'
import type { ColumnDef, Row, SortingState } from '@tanstack/react-table'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import {
  DataTable,
  DataTableColumnHeader,
  createPaginatedAdapter,
  useDataTableQuery,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { useFilters } from '@/lib/filter-context'
import { ALL_ERROR_TYPES, errorTypesQueryKey } from '@/lib/filters/error-types-cookie'

/** Referencia estable para el vacío. */
const EMPTY_GROUPED_ROWS: PunchGroupedRow[] = []
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { fetchPunchGrouped } from '@/lib/srs-kpis-api'
import { buildPunchGroupedParams } from '@/lib/ttk/punch-grouped-filters'
import { formatGroupedHoursDisplay } from '@/lib/ttk/format-grouped-hours'
import { buildPunchListParams } from '@/lib/ttk/punch-list-filters'
import type { PunchGroupedRow } from '@/lib/ttk/punch-grouped-types'
import type { PunchGroupedSort } from '@/lib/ttk/punch-grouped-filters'
import { TODAY_LIVE_STATUS_ALL, todayLiveStatusLabel } from '@/lib/ttk/today-live-status'
import {
  isPaymentTypeFilterAll,
  paymentTypeNames,
  type PaymentTypeFilterValue,
} from '@/lib/ttk/payment-type-filter'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { usePaymentTypesCatalog } from '@/hooks/use-payment-types-catalog'
import { CorrectedRecordsNote, IssuesDataTable } from '@/components/ttk/issues-data-table'
import { PunchErrorIndicator } from '@/components/ttk/punch-error-indicator'
import { GroupedPunchExportButton } from '@/components/ttk/grouped-punch-export-button'
import type {
  PunchGroupedExportLabels,
  PunchGroupedReportInfo,
} from '@/lib/ttk/punch-grouped-export'
import { errorTypeLabel, isErrorIssueType, type ErrorTypeCode } from '@/lib/ttk/error-type-meta'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canViewPaymentType } from '@/lib/auth/ttk-permissions'
import { useTranslation } from '@/lib/i18n/locale-context'
import { effectiveErrorStatus, resolveIssueType } from '@/lib/ttk/error-status'
import { getIssueFilterLabel } from '@/lib/i18n/label-helpers'

const groupedAdapter = createPaginatedAdapter<PunchGroupedRow>()

const GROUPED_HOURS_FORMAT_STORAGE_KEY = 'punch.grouped.hoursFormat'

function readGroupedHoursFormatPreference(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(GROUPED_HOURS_FORMAT_STORAGE_KEY)
  if (stored === '0') return false
  return true
}

/**
 * Columna de la grilla -> clave del endpoint.
 *
 * A nivel de MODULO por el mismo motivo que en Individual: `listExtra` se
 * declara antes que `columns`, asi que leer `columns` desde ese memo revienta.
 *
 * Antes esto era un ternario que caia a `nombreEmployee` para todo lo
 * desconocido, y el backend ademas tenia `@IsString()` sin whitelist: una
 * columna nueva ordenable habria ordenado por nombre EN SILENCIO. Ahora el
 * `@IsIn` del DTO devuelve 400 y esto tira en desarrollo.
 */
const PUNCH_GROUPED_SORT_BY_COLUMN_ID: Record<string, PunchGroupedSort> = {
  employee: 'nombreEmployee',
  hoursNumber: 'hoursNumber',
  breakNumber: 'breakNumber',
  punchCount: 'punchCount',
  errorCount: 'errorCount',
  fixedCount: 'fixedCount',
}

/** Orden inicial visible. El estado vacio se normaliza a esto (§4.3.8). */
const PUNCH_GROUPED_DEFAULT_SORTING: SortingState = [{ id: 'employee', desc: false }]

function mapGroupedSort(columnId: string | undefined): PunchGroupedSort {
  if (!columnId) return 'nombreEmployee'
  const key = PUNCH_GROUPED_SORT_BY_COLUMN_ID[columnId]
  if (!key) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Columna sin sortKey en PUNCH_GROUPED_SORT_BY_COLUMN_ID: ${columnId}`)
    }
    return 'nombreEmployee'
  }
  return key
}

function paymentTypeHours(row: PunchGroupedRow, label: string): number | null {
  const match = row.byPaymentType.find((pt) => pt.label === label)
  return match ? match.hoursNumber : null
}

function GroupedPunchDetail({
  row,
  useHoursFormat,
  snapshotAt,
  paymentTypeFilter,
}: {
  row: PunchGroupedRow
  useHoursFormat: boolean
  /** La misma foto que vio el padre: sin esto la expansión trae filas de más. */
  snapshotAt?: string
  /**
   * BUG-04: sin esto el detalle listaba ponchadas que el padre YA habia
   * descartado. El resto de los filtros baja solo por el contexto; este vivia
   * como state de la pagina y nadie se lo pasaba al detalle.
   *
   * NO se pasa `onPaymentTypeFilterChange`: el detalle no puede cambiar el
   * filtro de la pagina.
   */
  paymentTypeFilter?: PaymentTypeFilterValue
}) {
  const { t } = useTranslation()
  const employeeId = Number(row.idUsuario)

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">
        {t('punch.loadDetailsFailed')}
      </div>
    )
  }

  return (
    <div className="min-w-0 overflow-x-auto border-l-[3px] border-l-primary/40 bg-muted/20 px-4 py-3">
      <p className="mb-3 text-sm font-medium">
        {t('punch.punchesForEmployee', { name: row.nombreEmployee })}
      </p>
      <IssuesDataTable
        employeeIdOverride={employeeId}
        snapshotAt={snapshotAt}
        paymentTypeFilter={paymentTypeFilter}
        ignoreSearch
        showToolbarFilters={false}
        tableId={`grouped-detail-${employeeId}`}
        defaultPageSize={10}
        exportFileName={`punch-detail-${employeeId}`}
        queryKeySuffix={`grouped-${employeeId}`}
        tableScrollHeight={false}
        enableExport={false}
        enableTableFocus={false}
        // `Rows` y `Columns` ya estan en la tabla padre, arriba: repetirlos
        // adentro de cada fila expandida es ruido.
        enableToolbarControls={false}
        groupedHoursFormat={useHoursFormat}
        // El aviso de corregidas va una sola vez, arriba, en la tabla padre.
        showCorrectedNote={false}
      />
    </div>
  )
}

export type GroupedIssuesDataTableProps = {
  punchMinHoursRaw?: string
  punchMaxHoursRaw?: string
  paymentTypeFilter?: PaymentTypeFilterValue
}

export function GroupedIssuesDataTable({
  punchMinHoursRaw = '',
  punchMaxHoursRaw = '',
  paymentTypeFilter,
}: GroupedIssuesDataTableProps) {
  const { t } = useTranslation()
  const {
    selectedEmployee,
    selectedDealers,
    selectedType,
    errorStatus,
    selectedTodayLiveStatus,
    dateRange,
    filtersHydrated,
    includedErrorTypes: storedIncludedErrorTypes,
    errorTypesReady,
  } = useFilters()

  // El gate de la lista blanca mira el issueType YA CRUZADO: en modo corregido el
  // EXISTS del backend respeta los tipos tildados, así que la lista blanca rige.
  const crossedIssueType = resolveIssueType(selectedType, errorStatus)
  const isCorrectedMode = effectiveErrorStatus(selectedType, errorStatus) === 'corrected'
  const groupColumnLabel = isCorrectedMode
    ? t('punch.groupCorrectedColumn')
    : t('punch.withErrors')
  /** El export del detalle arma el XLSX en el navegador: los nombres van resueltos. */
  const errorTypeNamesForExport = React.useMemo(
    () => ({
      1: errorTypeLabel(t, 1),
      2: errorTypeLabel(t, 2),
      3: errorTypeLabel(t, 3),
    }),
    [t],
  )

  // Ver comentario en issues-data-table: la lista blanca sólo rige bajo un filtro
  // de error; con `all` la tabla trae todo y las tarjetas están inactivas.
  const includedErrorTypes = isErrorIssueType(crossedIssueType)
    ? storedIncludedErrorTypes
    : ALL_ERROR_TYPES
  const emptyByErrorTypes = includedErrorTypes.length === 0

  const { user, hasPermission } = useSrsMe()
  const canViewPayment = canViewPaymentType(hasPermission, user?.isSystemAdmin)

  // Catálogos para los nombres VISIBLES del Report Info. Los dos hooks tienen
  // query key fija, así que reusan lo que ya bajó el header: no piden de nuevo.
  const { dealers } = useSrsDealers()
  const { data: paymentTypeCatalog = [] } = usePaymentTypesCatalog(canViewPayment)

  const dealerNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const d of dealers) map.set(String(d.id), d.label || String(d.id))
    return map
  }, [dealers])

  const paymentTypeLabelForExport = React.useMemo(() => {
    // D-12: `All` cuando no hay nada tildado, y la lista de nombres cuando si.
    // «Sin tipo de pago» NO sale por aca: sale por la fila de *Issue type*
    // (`without_salary`), que este combo ya no escribe.
    if (paymentTypeFilter === undefined || isPaymentTypeFilterAll(paymentTypeFilter)) return null
    const names = paymentTypeNames(paymentTypeFilter, paymentTypeCatalog)
    return names.length > 0 ? names.join(', ') : paymentTypeFilter.ids.join(', ')
  }, [paymentTypeFilter, paymentTypeCatalog])

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSortingState] = React.useState<SortingState>(PUNCH_GROUPED_DEFAULT_SORTING)
  /** Idem Individual: el estado vacio se normaliza al orden inicial visible (D-4). */
  const setSorting = React.useCallback<React.Dispatch<React.SetStateAction<SortingState>>>(
    (next) =>
      setSortingState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        return resolved.length === 0 ? PUNCH_GROUPED_DEFAULT_SORTING : resolved
      }),
    [],
  )
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({})
  const [useHoursFormat, setUseHoursFormat] = React.useState(true)

  React.useEffect(() => {
    setUseHoursFormat(readGroupedHoursFormatPreference())
  }, [])

  const handleHoursFormatChange = React.useCallback((checked: boolean) => {
    setUseHoursFormat(checked)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GROUPED_HOURS_FORMAT_STORAGE_KEY, checked ? '1' : '0')
    }
  }, [])

  const debouncedDealers = useDebouncedValue(selectedDealers, 450)
  const debouncedMinHours = useDebouncedValue(punchMinHoursRaw, 600)
  const debouncedMaxHours = useDebouncedValue(punchMaxHoursRaw, 600)
  const minHoursTotal = debouncedMinHours !== '' ? Number(debouncedMinHours) : null
  const maxHoursTotal = debouncedMaxHours !== '' ? Number(debouncedMaxHours) : null

  const sortCol = sorting[0]?.id
  const sortDir = sorting[0]?.desc ? 'desc' : 'asc'

  /**
   * Frontera congelada del período. La genera el server en la página 1 y la
   * reusamos en las siguientes, para que todas miren la misma foto: esta tabla
   * pagina por OFFSET y cada ponchada nueva correría las páginas.
   *
   * Va en un ref y no en state para no forzar un render extra: el memo de params
   * ya se recalcula al cambiar de página, que es cuando hace falta leerlo.
   */
  const snapshotAtRef = React.useRef<string | undefined>(undefined)

  const listExtra = React.useMemo(
    () =>
      buildPunchGroupedParams({
        selectedDealers: debouncedDealers,
        dateRange,
        selectedType,
        selectedEmployeeId: selectedEmployee?.id ?? null,
        // Vacío a propósito: el empleado se elige en el header y viaja arriba, en
        // `selectedEmployeeId`. El buscador libre de esta grilla era un segundo
        // filtro del mismo campo y se sacó.
        search: '',
        page: pageIndex + 1,
        pageSize,
        snapshotAt: pageIndex > 0 ? snapshotAtRef.current : undefined,
        includedErrorTypes,
        errorStatus,
        sort: mapGroupedSort(sortCol),
        dir: sortDir as 'asc' | 'desc',
        minHoursTotal,
        maxHoursTotal,
        paymentTypeFilter,
        // §4.1bis — la pantalla YA mostraba las tarjetas Working/On lunch/Out en
        // Grouped, pero este filtro no bajaba a la consulta del padre y SI al
        // detalle expandido: la fila y su detalle contaban universos distintos.
        // Es la misma incoherencia de BUG-04, al reves.
        todayLiveStatus: selectedTodayLiveStatus,
      }),
    [
      debouncedDealers,
      dateRange,
      selectedType,
      selectedEmployee?.id,
      pageIndex,
      pageSize,
      sortCol,
      sortDir,
      minHoursTotal,
      maxHoursTotal,
      paymentTypeFilter,
      includedErrorTypes,
      errorStatus,
      selectedTodayLiveStatus,
    ],
  )

  const queryEnabled =
    filtersHydrated &&
    errorTypesReady &&
    !emptyByErrorTypes &&
    debouncedDealers.length > 0 &&
    Boolean(listExtra.fechaDesde) &&
    Boolean(listExtra.fechaHasta)

  const groupedParamsBase = React.useMemo(() => {
    const { page: _p, pageSize: _s, ...rest } = listExtra
    void _p
    void _s
    return rest
  }, [listExtra])

  /**
   * Params del detalle por empleado del export (endpoint nuevo, paginado por cursor).
   *
   * La whitelist tiene que viajar acá también, no sólo en la query agrupada: sin
   * ella el detalle traía las ponchadas de los tipos excluidos y, como el backend
   * no serializa `errorType` con lista default, las marcaba WITH ERRORS = Yes.
   * La pantalla decía 4 y el xlsx traía 6.
   */
  const punchListParams = React.useMemo(
    () =>
      buildPunchListParams({
        search: '',
        selectedDealers: debouncedDealers,
        dateRange,
        selectedType,
        selectedEmployeeId: null,
        pageSize: 500,
        todayLiveStatus: selectedTodayLiveStatus,
        includedErrorTypes,
        errorStatus,
        // Payment type SÍ viaja: filtra ponchada por ponchada, igual que en la
        // consulta agrupada. Sin él el detalle del export traía ponches de otros
        // tipos de pago que la pantalla no lista.
        paymentTypeFilter,
      }),
    [
      debouncedDealers,
      dateRange,
      selectedType,
      selectedTodayLiveStatus,
      includedErrorTypes,
      errorStatus,
      paymentTypeFilter,
    ],
  )

  // minHoursTotal/maxHoursTotal NO viajan acá a propósito. En Grouped el filtro de
  // horas es sobre el TOTAL del empleado en el período —lo dice el cartel de la
  // pantalla—, no sobre cada ponchada. Pasarlo al detalle lo aplicaría ponche por
  // ponche y escondería ponchadas de empleados que sí pasaron el filtro.

  const buildExportLabels = React.useCallback((): PunchGroupedExportLabels => {
    return {
      employee: t('common.employee'),
      // P7 — set 1. *Fixed* y no *Corrected*: en modo Corregidos la columna
      // dinamica ya se llama *Corrected*, y en el Excel no hay tooltip que
      // desambigue dos encabezados iguales.
      punchCount: t('punch.punchCount'),
      errorCount: t('punch.errorCount'),
      fixedCount: t('punch.fixedCount'),
      correctedColumn: t('punch.corrected'),
      errorTypeNames: { 1: errorTypeLabel(t, 1), 2: errorTypeLabel(t, 2), 3: errorTypeLabel(t, 3) },
      roleDept: t('punch.roleDept'),
      date: t('common.date'),
      punchIn: t('punch.punchIn'),
      breakStart: t('punch.breakStart'),
      breakEnd: t('punch.breakEnd'),
      punchOut: t('punch.punchOut'),
      timeWork: t('punch.timeWork'),
      timeBreak: t('punch.timeBreak'),
      paymentType: t('punch.paymentType'),
      dealer: t('profile.dealer'),
      hasError: groupColumnLabel,
      yes: t('punch.exportYes'),
      no: t('punch.exportNo'),
      correctedTypes: t('punch.groupCorrectedColumn'),
      lastCorrectedAt: t('punch.correctedWhen'),
      deletedPunch: t('punch.deletedPunchChip'),
      groupedSheet: t('punch.exportGroupedSheetName'),
      totalHours: t('punch.totalHours'),
      exportingProgress: t('punch.exportGroupedGenerating'),
      exportSheetSubtitle: t('punch.exportSheetSubtitle'),
      exportDetailSheetTitle: t('punch.exportDetailSheetTitle'),
      reportInfo: {
        sheet: t('punch.exportReportInfoSheet'),
        field: t('punch.exportField'),
        value: t('punch.exportValue'),
        report: t('punch.exportReport'),
        generated: t('punch.exportGenerated'),
        generatedBy: t('punch.exportGeneratedBy'),
        screen: t('punch.exportScreen'),
        screenValue: t('punch.exportScreenValue'),
        mode: t('punch.exportMode'),
        scope: t('punch.exportScope'),
        period: t('punch.exportPeriod'),
        until: t('punch.exportUntil'),
        dealers: t('profile.dealer'),
        employee: t('common.employee'),
        paymentType: t('punch.paymentType'),
        errorTypes: t('punch.errorTypesReportInfo'),
        errorStatus: t('punch.errorStatus'),
        liveStatus: t('punch.liveStatusToday'),
        issueType: t('punch.issueTypeReportInfo'),
        search: t('common.search'),
        minHours: t('punch.minHoursReportInfo'),
        maxHours: t('punch.maxHoursReportInfo'),
        all: t('punch.exportAll'),
      },
    }
  }, [t])

  /**
   * Nombres VISIBLES de los filtros, congelados al hacer clic en exportar.
   * La regla prohíbe exportar ids o nombres técnicos, y esta grilla no tiene los
   * catálogos: los baja la página y los pasa ya resueltos.
   */
  const buildReportInfo = React.useCallback((): PunchGroupedReportInfo => {
    const all = t('punch.exportAll')
    const dealerNames = selectedDealers
      .map((id) => dealerNameById?.get(id) ?? id)
      .filter(Boolean)
    return {
      generatedBy: user?.nombre ?? user?.email ?? '—',
      // mode/scope los completa el botón, que es el que sabe qué eligió el usuario.
      mode: '',
      scope: '',
      dealers: dealerNames.length > 0 ? dealerNames.join(', ') : all,
      employee: selectedEmployee?.nombre ?? all,
      paymentType: paymentTypeLabelForExport ?? all,
      errorTypes:
        includedErrorTypes.length === 3
          ? all
          : includedErrorTypes.map((c) => errorTypeLabel(t, c as ErrorTypeCode)).join(', '),
      // Los cinco de abajo faltaban: el Report Info decía "sin filtro" sobre filtros
      // que sí estaban aplicando (`xls-export-report-info` es alwaysApply).
      errorStatus: isCorrectedMode
        ? t('punch.errorStatusCorrected')
        : t('punch.errorStatusPending'),
      issueType: selectedType && selectedType !== 'all' ? getIssueFilterLabel(t, selectedType) : all,
      search: all,
      minHours: minHoursTotal != null ? String(minHoursTotal) : all,
      maxHours: maxHoursTotal != null ? String(maxHoursTotal) : all,
      liveStatus:
        selectedTodayLiveStatus && selectedTodayLiveStatus !== TODAY_LIVE_STATUS_ALL
          ? todayLiveStatusLabel(selectedTodayLiveStatus)
          : all,
    }
  }, [
    t,
    user,
    selectedDealers,
    dealerNameById,
    selectedEmployee,
    paymentTypeLabelForExport,
    includedErrorTypes,
    isCorrectedMode,
    selectedType,
    minHoursTotal,
    maxHoursTotal,
  ])

  React.useEffect(() => {
    setPageIndex(0)
    setRowSelection({})
    // El snapshot congela la frontera superior de la paginación: si no se
    // descarta al cambiar el filtro, la página 2 se pagina con la foto del
    // universo anterior y mezcla dos conjuntos de datos.
    snapshotAtRef.current = undefined
  }, [
    debouncedDealers,
    selectedType,
    dateRange,
    minHoursTotal,
    maxHoursTotal,
    paymentTypeFilter,
    selectedEmployee?.id,
    includedErrorTypes,
    // `errorStatus` FALTABA. El request y la queryKey si cambian con el estado,
    // asi que pasar de Pendientes a Corregidos DESDE LA PAGINA 3 pedia la
    // pagina 3 del universo nuevo —que puede no existir, y la tabla queda
    // vacia— y dejaba seleccionadas filas del modo anterior.
    errorStatus,
    selectedTodayLiveStatus,
  ])

  const columns = React.useMemo<ColumnDef<PunchGroupedRow>[]>(
    () => [
      {
        id: 'select',
        size: 40,
        minSize: 40,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label={t('punch.selectAllOnPage')}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t('punch.selectEmployee')}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        meta: {
          label: t('punch.selectEmployee'),
          pin: 'left',
          headerClassName: 'w-[40px] px-2',
          cellClassName: 'px-2',
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'expand',
        size: 40,
        minSize: 40,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">{t('punch.expandPunches')}</span>,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
            aria-expanded={row.getIsExpanded()}
            aria-label={
              row.getIsExpanded() ? t('punch.collapsePunches') : t('punch.expandPunches')
            }
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {row.getIsExpanded() ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ),
        meta: {
          label: t('punch.expandPunches'),
          headerClassName: 'w-[40px] px-2',
          cellClassName: 'px-2',
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'employee',
        accessorFn: (row) => row.nombreEmployee,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('common.employee')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  row.toggleExpanded()
                }}
                className="min-w-0 cursor-pointer truncate text-left font-medium hover:underline"
              >
                {r.nombreEmployee}
              </button>
              {!isCorrectedMode && r.errorSummary ? (
                <span
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <PunchErrorIndicator errorText={r.errorSummary} />
                </span>
              ) : null}
            </div>
          )
        },
        meta: {
          label: t('common.employee'),
          sortKey: 'nombreEmployee',
          exportValue: (r) => r.nombreEmployee,
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'hoursNumber',
        accessorFn: (row) => row.hoursNumber,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.totalHours')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono font-semibold tabular-nums">
            {formatGroupedHoursDisplay(row.original.hoursNumber, useHoursFormat)}
          </span>
        ),
        meta: {
          label: t('punch.totalHours'),
          sortKey: 'hoursNumber',
          mono: true,
          exportValue: (r) => String(r.hoursNumber),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'breakNumber',
        accessorFn: (row) => row.breakNumber,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.timeBreak')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-muted-foreground">
            {formatGroupedHoursDisplay(row.original.breakNumber, useHoursFormat)}
          </span>
        ),
        meta: {
          label: t('punch.timeBreak'),
          sortKey: 'breakNumber',
          mono: true,
          exportValue: (r) => String(r.breakNumber),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'hasError',
        accessorFn: (row) => row.hasError,
        enableSorting: false,
        // La columna cambia de FUENTE, no sólo de etiqueta (decisión D-B): mirando
        // corregidos la pregunta no es "¿tiene errores?" sino "¿qué se le corrigió?".
        // El backend manda `correctedTypes` en vez de `errorSummary` en ese modo.
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={groupColumnLabel} />
        ),
        cell: ({ row }) => {
          const r = row.original
          // D-11 / a2 — el numero va ADENTRO de esta columna, en los DOS modos:
          // en Pending los errores VIGENTES, en Corrected las ponchadas con
          // correccion. Cambia de significado con el modo, y eso es legible solo
          // porque el header tambien cambia. Sin dato no se pinta ningun `0`.
          const count = isCorrectedMode ? r.fixedCount : r.errorCount
          const countBadge =
            count > 0 ? (
              <span className="ml-1.5 font-mono text-xs font-semibold tabular-nums">{count}</span>
            ) : null

          if (isCorrectedMode) {
            const types = r.correctedTypes ?? []
            if (types.length === 0) {
              return <span className="text-xs text-muted-foreground">{t('punch.exportNo')}</span>
            }
            return (
              <span className="text-xs">
                {types.map((type) => errorTypeLabel(t, type as ErrorTypeCode)).join(', ')}
                {countBadge}
              </span>
            )
          }
          if (!r.hasError) {
            return <span className="text-xs text-muted-foreground">{t('punch.exportNo')}</span>
          }
          if (r.errorSummary) {
            return (
              <span
                className="inline-flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <PunchErrorIndicator errorText={r.errorSummary} />
                {countBadge}
              </span>
            )
          }
          return (
            <span className="text-xs">
              {t('punch.exportYes')}
              {countBadge}
            </span>
          )
        },
        meta: {
          label: groupColumnLabel,
          // Invariante de D-11: header = celda = export. La celda muestra el
          // numero, asi que el export lo lleva tambien.
          exportValue: (r) => {
            const count = isCorrectedMode ? r.fixedCount : r.errorCount
            const suffix = count > 0 ? ` (${count})` : ''
            if (isCorrectedMode) {
              const types = (r.correctedTypes ?? []).map((type) =>
                errorTypeLabel(t, type as ErrorTypeCode),
              )
              return types.length === 0 ? t('punch.exportNo') : types.join(', ') + suffix
            }
            return r.hasError ? t('punch.exportYes') + suffix : t('punch.exportNo')
          },
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      // P7 — set 1: Punches / Errors / Fixed. *Fixed* y no *Corrected* porque en
      // modo Corregidos la columna dinamica YA se llama *Corrected*, y dos
      // headers iguales con fuentes distintas es ilegible, sobre todo en el Excel.
      // Las tres ORDENAN (son las unicas de esta grilla) y arrancan OCULTAS: el
      // numero ya se ve adentro de la dinamica, estas estan para ordenar y para
      // el Excel.
      {
        id: 'punchCount',
        accessorFn: (row) => row.punchCount,
        // El default del DataTable es 160px: muchisimo para un contador de una o
        // dos cifras. Lo que fija el piso es el ancho del encabezado, no el dato.
        size: 104,
        minSize: 84,
        maxSize: 130,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.punchCount')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.punchCount}</span>
        ),
        meta: {
          label: t('punch.punchCount'),
          sortKey: 'punchCount',
          mono: true,
          exportValue: (r) => String(r.punchCount),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'errorCount',
        accessorFn: (row) => row.errorCount,
        // El default del DataTable es 160px: muchisimo para un contador de una o
        // dos cifras. Lo que fija el piso es el ancho del encabezado, no el dato.
        size: 104,
        minSize: 84,
        maxSize: 130,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.errorCount')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.errorCount}</span>
        ),
        meta: {
          label: t('punch.errorCount'),
          sortKey: 'errorCount',
          mono: true,
          exportValue: (r) => String(r.errorCount),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'fixedCount',
        accessorFn: (row) => row.fixedCount,
        // El default del DataTable es 160px: muchisimo para un contador de una o
        // dos cifras. Lo que fija el piso es el ancho del encabezado, no el dato.
        size: 104,
        minSize: 84,
        maxSize: 130,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.fixedCount')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.fixedCount}</span>
        ),
        meta: {
          label: t('punch.fixedCount'),
          sortKey: 'fixedCount',
          mono: true,
          exportValue: (r) => String(r.fixedCount),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
    ],
    // `isCorrectedMode` y `groupColumnLabel` FALTABAN: la celda, el header y el
    // exportValue de la columna dinamica los leen, asi que al mover el switch
    // Pendientes/Corregidos sin recargar la columna se quedaba con la etiqueta,
    // la fuente o el exportador del modo anterior. Es un defecto preexistente,
    // pero esta linea es justo la que hay que editar.
    [t, useHoursFormat, isCorrectedMode, groupColumnLabel],
  )

  const {
    rows: rawRows,
    total: rawTotal,
    pageCount: rawPageCount,
    isFetching: rawIsFetching,
    error,
  } = useDataTableQuery({
    adapter: groupedAdapter,
    queryKey: [
      'punch-grouped',
      debouncedDealers.slice().sort().join(','),
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
      selectedType,
      pageIndex,
      pageSize,
      sorting,
      minHoursTotal,
      maxHoursTotal,
      paymentTypeFilter,
      selectedEmployee?.id,
      // Obligatorio: esta tabla pasa `extra: {}` a useDataTableQuery, así que el
      // escape hatch que mete `extra` en la key no aplica acá.
      errorTypesQueryKey(includedErrorTypes),
      selectedTodayLiveStatus,
      // El issueType YA CRUZADO con el estado. `selectedType` solo no alcanza:
      // no cambia al pasar de pendientes a corregidos, así que sin esto la tabla
      // se queda con la página cacheada del otro estado.
      crossedIssueType,
    ],
    queryFn: async () => {
      const res = await fetchPunchGrouped(listExtra)
      // La página 1 viene sin snapshot y el server devuelve el suyo: lo guardamos
      // para que las siguientes pidan contra la misma foto.
      snapshotAtRef.current = res.snapshotAt
      return res
    },
    enabled: queryEnabled,
    staleTime: 2 * 60 * 1000,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    extra: {},
  })

  // `useDataTableQuery` fija `placeholderData: keepPreviousData`, así que
  // `enabled:false` deja pintadas las filas del universo anterior. Con los tres
  // tipos destildados hay que descartar el resultado en el borde de render.
  const rows = emptyByErrorTypes ? EMPTY_GROUPED_ROWS : rawRows
  const total = emptyByErrorTypes ? 0 : rawTotal
  const pageCount = emptyByErrorTypes ? 1 : rawPageCount
  const isFetching = emptyByErrorTypes ? false : rawIsFetching

  const paymentTypeLabels = React.useMemo(() => {
    const labels = new Set<string>()
    for (const row of rows) {
      for (const pt of row.byPaymentType) {
        labels.add(pt.label)
      }
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const columnsWithPaymentTypes = React.useMemo<ColumnDef<PunchGroupedRow>[]>(() => {
    const paymentCols: ColumnDef<PunchGroupedRow>[] = paymentTypeLabels.map((label) => ({
      id: `pt-${label}`,
      accessorFn: (row) => paymentTypeHours(row, label),
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={label} />,
      cell: ({ row }) => {
        const hours = paymentTypeHours(row.original, label)
        return (
          <span className="font-mono tabular-nums text-xs">
            {hours != null ? formatGroupedHoursDisplay(hours, useHoursFormat) : '—'}
          </span>
        )
      },
      meta: {
        label,
        mono: true,
        exportValue: (r) => {
          const h = paymentTypeHours(r, label)
          return h != null ? String(h) : ''
        },
      } satisfies DataTableColumnMeta<PunchGroupedRow>,
    }))
    return [...columns, ...paymentCols]
  }, [columns, paymentTypeLabels, useHoursFormat])

  const emptyState = !filtersHydrated ? (
    <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
  ) : selectedDealers.length === 0 ? (
    <span className="text-xs text-muted-foreground">{t('punch.loadFiltersFirst')}</span>
  ) : (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <AlertTriangle className="h-8 w-8 opacity-20" />
      <span className="text-xs">{t('punch.noRecordsForFilters')}</span>
    </div>
  )

  const selectedEmployeeIds = React.useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([id]) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    [rowSelection],
  )

  const renderSubComponent = React.useCallback(
    (row: Row<PunchGroupedRow>) => (
      <GroupedPunchDetail
        row={row.original}
        useHoursFormat={useHoursFormat}
        snapshotAt={snapshotAtRef.current}
        paymentTypeFilter={paymentTypeFilter}
      />
    ),
    [useHoursFormat, paymentTypeFilter],
  )

  return (
    <div className="space-y-4">
      {(minHoursTotal != null || maxHoursTotal != null) && (
        <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          {t('punch.groupedHoursHint')}
        </p>
      )}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <DataTable<PunchGroupedRow>
        tableId="issues-grouped"
        columns={columnsWithPaymentTypes}
        data={rows}
        getRowId={(row) => String(row.idUsuario)}
        isLoading={isFetching}
        emptyState={emptyState}
        // El empleado ya se filtra desde el header, que aplica a las dos vistas.
        // Este buscador era un segundo filtro del mismo campo, en otro lugar y con
        // otro alcance: dos controles para lo mismo que se contradicen entre sí.
        enableGlobalFilter={false}
        manualFiltering
        recordsCountNote={isCorrectedMode ? <CorrectedRecordsNote /> : null}
        enableExport={false}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        manualSorting
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next)
          setPageIndex(0)
        }}
        pagination={{
          pageIndex,
          pageSize,
          pageCount,
          totalRows: total,
          onPaginationChange: (next) => {
            setPageIndex(next.pageIndex)
            setPageSize(next.pageSize)
          },
        }}
        toolbarLeading={
          selectedEmployeeIds.length > 0 ? (
            <Badge variant="secondary" className="h-6 text-[10px] font-medium">
              {t('punch.exportSelectedCount', { count: selectedEmployeeIds.length })}
            </Badge>
          ) : null
        }
        toolbarTrailing={
          <>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="grouped-hours-format"
                className="cursor-pointer text-[11px] text-muted-foreground"
              >
                {useHoursFormat ? t('punch.hoursFormatHrs') : t('punch.hoursFormatDecimal')}
              </Label>
              <Switch
                id="grouped-hours-format"
                checked={useHoursFormat}
                onCheckedChange={handleHoursFormatChange}
                aria-label={t('punch.hoursFormat')}
              />
            </div>
            <GroupedPunchExportButton
              disabled={!queryEnabled || rows.length === 0}
              fileName="punch-grouped"
              groupedParamsBase={groupedParamsBase}
              punchListParams={punchListParams}
              includePaymentType={canViewPayment}
              buildLabels={buildExportLabels}
              buildReportInfo={buildReportInfo}
              includedErrorTypes={includedErrorTypes}
              includeCorrected={isCorrectedMode}
              errorTypeNames={errorTypeNamesForExport}
              selectedEmployeeIds={selectedEmployeeIds}
            />
          </>
        }
        renderSubComponent={renderSubComponent}
        subComponentLayout="full"
      />
    </div>
  )
}
