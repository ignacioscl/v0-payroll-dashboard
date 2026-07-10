'use client'

import * as React from 'react'
import type { ColumnDef, ColumnPinningState, SortingState } from '@tanstack/react-table'
import {
  AlertTriangle,
  CheckCircle,
  Images,
  Info,
  Pencil,
  Trash2,
} from 'lucide-react'
import {
  DataTable,
  DataTableColumnHeader,
  createTtkListAdapter,
  useDataTableQuery,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { useFilters } from '@/lib/filter-context'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { throwIfSrsFail } from '@/lib/srs/parse-srs-response'
import {
  buildTtkListFilterExtra,
  formatDurationDisplay,
  formatGmtDate,
  formatGmtTime,
  toPayrollScopeUser,
} from '@/lib/ttk/map-header-filters'
import { formatUsDateForExport, formatUsTimeForExport } from '@/lib/format-us-datetime'
import type { TtkListResponse, TtkListRow } from '@/lib/ttk/ttk-list-types'
import { SrsPhpPath } from '@/types/enum-url'
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
  PAYMENT_TYPE_FILTER_WITHOUT,
  type PaymentTypeFilterValue,
} from '@/lib/ttk/payment-type-filter'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { toast } from 'sonner'
import { PunchDeleteConfirmDialog } from '@/components/ttk/punch-delete-confirm-dialog'
import { useMinWidth } from '@/hooks/use-mobile'
import { useTranslation } from '@/lib/i18n/locale-context'

import type { DateRange } from 'react-day-picker'

/** Pin Employee / Actions only at this width and above. */
const TABLE_PIN_MIN_WIDTH = 1200

export type IssuesDataTableProps = {
  /** Overrides header date range (e.g. dashboard yesterday-only). */
  dateRangeOverride?: DateRange
  /** Overrides header issue-type filter. */
  issueTypeOverride?: string
  /** When true, ignores header search text. */
  ignoreSearch?: boolean
  tableId?: string
  defaultPageSize?: number
  exportFileName?: string
  queryKeySuffix?: string
  /**
   * Max-height of the scroll container. Enables sticky header.
   * Defaults to `calc(100dvh - 24rem)` which fits the issues page layout
   * (nav 4rem + padding + title + KPI cards + toolbar + pagination ≈ 24rem).
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
}

const ttkListAdapter = createTtkListAdapter<TtkListRow>(mapTtkOrderBy)

function mapTtkOrderBy(sorting: SortingState): string {
  const first = sorting[0]
  if (!first) return 'tew.punch_in DESC'
  if (first.id === 'employee') {
    return first.desc ? 'us.nombre DESC' : 'us.nombre'
  }
  return first.desc ? 'tew.punch_in DESC' : 'tew.punch_in'
}

function roleLabel(row: TtkListRow): string {
  if (!row.rolDpto) return ''
  const parts = [row.rolDpto.role, row.rolDpto.department].filter(Boolean)
  return parts.join(' / ')
}

function punchErrorLabel(row: TtkListRow): string | null {
  const res = row.badPunch?.res?.trim()
  return res ? res : null
}

export function IssuesDataTable({
  dateRangeOverride,
  issueTypeOverride,
  ignoreSearch = false,
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
}: IssuesDataTableProps = {}) {
  const { t } = useTranslation()
  // Dynamic scroll height: fills the available viewport below the fixed nav,
  // DataTable toolbar, pagination row, and page bottom padding.
  // Updates on window resize so it works on every screen size.
  const [computedScrollHeight, setComputedScrollHeight] = React.useState<string | undefined>(undefined)
  React.useLayoutEffect(() => {
    const NAV_H = 64      // dashboard nav h-16
    const TOOLBAR_H = 40  // DataTable toolbar row
    const PAGINATION_H = 52 // DataTable pagination row
    const BOTTOM_PAD = 24  // page p-6 bottom padding

    const compute = () => {
      const h = window.innerHeight - NAV_H - TOOLBAR_H - PAGINATION_H - BOTTOM_PAD
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
    selectedTodayLiveStatus,
    dateRange,
    filtersHydrated,
  } = useFilters()

  const effectiveDateRange = dateRangeOverride ?? dateRange
  const effectiveSelectedType = issueTypeOverride ?? selectedType
  const effectiveSearch = ignoreSearch ? '' : search

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'date', desc: true },
  ])
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

  React.useEffect(() => {
    if (!canViewPayment || !showToolbarFilters) return
    if (effectiveSelectedType === 'without_salary') {
      setPaymentTypeFilter(PAYMENT_TYPE_FILTER_WITHOUT)
    } else {
      setPaymentTypeFilter((prev) =>
        prev === PAYMENT_TYPE_FILTER_WITHOUT ? PAYMENT_TYPE_FILTER_ALL : prev,
      )
    }
  }, [effectiveSelectedType, canViewPayment, showToolbarFilters, setPaymentTypeFilter])

  const handlePaymentTypeFilterChange = React.useCallback(
    (next: PaymentTypeFilterValue) => {
      setPaymentTypeFilter(next)
      setPageIndex(0)
      if (next === PAYMENT_TYPE_FILTER_WITHOUT) {
        setSelectedType('without_salary')
        return
      }
      if (selectedType === 'without_salary' || effectiveSelectedType === 'without_salary') {
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

  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    TtkListResponse
  >(SrsPhpPath.TTK_LIST)

  const listExtra = React.useMemo(
    () =>
      buildTtkListFilterExtra({
        search: effectiveSearch,
        selectedDealers: debouncedDealers,
        dateRange: effectiveDateRange,
        selectedType: effectiveSelectedType,
        selectedEmployeeId: selectedEmployee?.id ?? null,
        punchMinHours,
        punchMaxHours,
        paymentTypeFilter: effectivePaymentTypeFilter,
        todayLiveStatus:
          selectedTodayLiveStatus !== TODAY_LIVE_STATUS_ALL
            ? selectedTodayLiveStatus
            : undefined,
        scopeUser: toPayrollScopeUser(user),
      }),
    [
      effectiveSearch,
      debouncedDealers,
      effectiveDateRange,
      effectiveSelectedType,
      selectedEmployee?.id,
      punchMinHours,
      punchMaxHours,
      effectivePaymentTypeFilter,
      selectedTodayLiveStatus,
      user,
    ],
  )

  const queryEnabled =
    filtersHydrated &&
    debouncedDealers.length > 0 &&
    Boolean(listExtra.fecha_desde) &&
    Boolean(listExtra.fecha_hasta)

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
                  {punchErrorLabel(r) ? (
                    <PunchErrorIndicator errorText={punchErrorLabel(r)!} />
                  ) : null}
                  {Number(r.manualCreate) === 1 ? <PunchManualIndicator /> : null}
                  {r.fixedAt ? (
                    <PunchFixedIndicator
                      fixedAt={r.fixedAt}
                      fixedByName={r.fixedBy?.nombre}
                      errorSnapshot={r.fixedErrorSnapshot}
                    />
                  ) : null}
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
          sortKey: 'us.nombre',
          exportValue: (r) => r.usuario?.nombre ?? '',
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'role',
        accessorFn: (row) => roleLabel(row),
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
          sortKey: 'tew.punch_in',
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
        cell: ({ row }) => formatDurationDisplay(row.original.timeWork) || '—',
        meta: {
          label: t('punch.timeWork'),
          mono: true,
          exportValue: (r) => formatDurationDisplay(r.timeWork),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'timeBreak',
        accessorFn: (row) => row.timeBreak ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.timeBreak')} />
        ),
        cell: ({ row }) => formatDurationDisplay(row.original.timeBreak) || '—',
        meta: {
          label: t('punch.timeBreak'),
          mono: true,
          exportValue: (r) => formatDurationDisplay(r.timeBreak),
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
                  className="h-7 w-7 cursor-pointer text-muted-foreground hover:bg-sky-500/10 hover:text-sky-600"
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
                  className="h-7 w-7 cursor-pointer text-muted-foreground hover:bg-sky-500/10 hover:text-sky-600"
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
    t,
  ])

  const columnPinning = React.useMemo<ColumnPinningState>(
    () => ({
      left: isWideScreen ? ['employee'] : [],
      right: isWideScreen && showActions ? ['actions'] : [],
    }),
    [isWideScreen, showActions],
  )

  React.useEffect(() => {
    setPageIndex(0)
  }, [
    debouncedSearch,
    debouncedDealers,
    effectiveSelectedType,
    effectiveDateRange,
    pageSize,
    sorting,
    ignoreSearch,
    punchMinHours,
    punchMaxHours,
    selectedTodayLiveStatus,
  ])

  const fetchAllRowsForExport = React.useCallback(async (): Promise<TtkListRow[]> => {
    if (!queryEnabled) return []

    const exportPageSize = 500
    const collected: TtkListRow[] = []
    let pageIndex = 0
    let totalRows = 0

    do {
      const params = ttkListAdapter.buildRequest({
        pageIndex,
        pageSize: exportPageSize,
        sorting,
        columnFilters: [],
        columns: [],
        extra: listExtra,
      })
      const data = await apiRequest.getCustom('', undefined, params)
      throwIfSrsFail(data, t('punch.loadExportFailed'))
      const parsed = ttkListAdapter.parseResponse(data as TtkListResponse, {
        pageIndex,
        pageSize: exportPageSize,
      })
      collected.push(...parsed.rows)
      totalRows = parsed.total
      pageIndex += 1
    } while (collected.length < totalRows && collected.length > 0)

    return collected
  }, [apiRequest, listExtra, queryEnabled, sorting, t])

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: ttkListAdapter,
    queryKey: [
      'ttk-list',
      queryKeySuffix,
      debouncedSearch,
      debouncedDealers.slice().sort().join(','),
      effectiveDateRange?.from?.toISOString(),
      effectiveDateRange?.to?.toISOString(),
      effectiveSelectedType,
      effectivePaymentTypeFilter,
      selectedTodayLiveStatus,
    ],
    queryFn: async (params) => {
      const data = await apiRequest.getCustom('', undefined, params)
      throwIfSrsFail(data, t('punch.loadIssuesFailed'))
      return data as TtkListResponse
    },
    enabled: queryEnabled,
    staleTime: 2 * 60 * 1000,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    extra: listExtra,
  })

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
          isLoading={isFetching}
          emptyState={emptyState}
          enableGlobalFilter={false}
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
          includeAllPageSize
          enableViewOptions
          enableExport
          exportFileName={exportFileName}
          fetchAllRowsForExport={fetchAllRowsForExport}
          manualSorting
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next)
            setPageIndex(0)
          }}
          manualFiltering
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
          tableScrollHeight={effectiveScrollHeight}
          enableTableFocus
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
