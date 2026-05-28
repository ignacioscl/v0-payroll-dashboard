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
  formatGmtDate,
  formatGmtTime,
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
import { EditPunchDialog } from '@/components/ttk/edit-punch-dialog'
import { PunchLogDialog } from '@/components/ttk/punch-log-dialog'
import { Button } from '@/components/ui/button'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAddOrEditPunch, canDeletePunch } from '@/lib/auth/ttk-permissions'
import { useTtkDeletePunch } from '@/hooks/use-ttk-delete-punch'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { toast } from 'sonner'
import { PunchDeleteConfirmDialog } from '@/components/ttk/punch-delete-confirm-dialog'

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

export function IssuesDataTable() {
  const {
    search,
    selectedDealers,
    selectedType,
    dateRange,
    filtersHydrated,
  } = useFilters()

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'date', desc: true },
  ])
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

  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const deleteMutation = useTtkDeletePunch()
  const canEdit = canAddOrEditPunch(hasPermission, user?.isSystemAdmin)
  const canDelete = canDeletePunch(hasPermission, user?.isSystemAdmin)
  const showActions = !meLoading

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
        search: debouncedSearch,
        selectedDealers: debouncedDealers,
        dateRange,
        selectedType,
      }),
    [debouncedSearch, debouncedDealers, dateRange, selectedType],
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
        size: 280,
        minSize: 200,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Employee" />
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
          label: 'Employee',
          pin: 'left',
          sortKey: 'us.nombre',
          exportValue: (r) => r.usuario?.nombre ?? '',
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'role',
        accessorFn: (row) => roleLabel(row),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Role / Dept" />
        ),
        cell: ({ row }) => roleLabel(row.original) || '—',
        meta: {
          label: 'Role / Dept',
          exportValue: (r) => roleLabel(r),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'date',
        accessorFn: (row) => row.punchInGmt0 ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date" />
        ),
        cell: ({ row }) => formatGmtDate(row.original.punchInGmt0) || '—',
        meta: {
          label: 'Date',
          sortKey: 'tew.punch_in',
          exportValue: (r) => formatUsDateForExport(r.punchInGmt0),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'punchIn',
        accessorFn: (row) => row.punchInGmt0 ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Punch In" />
        ),
        cell: ({ row }) => {
          const r = row.original
          const time = formatGmtTime(r.punchInGmt0)
          return (
            <PunchTimeCell time={time} method={time ? punchInMethod(r) : null} />
          )
        },
        meta: {
          label: 'Punch In',
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
          <DataTableColumnHeader column={column} title="Break Start" />
        ),
        cell: ({ row }) => {
          const r = row.original
          const time = formatGmtTime(r.breakStartGmt0)
          return (
            <PunchTimeCell time={time} method={time ? breakStartMethod(r) : null} />
          )
        },
        meta: {
          label: 'Break Start',
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
          <DataTableColumnHeader column={column} title="Break End" />
        ),
        cell: ({ row }) => {
          const r = row.original
          const time = formatGmtTime(r.breakEndGmt0)
          return (
            <PunchTimeCell time={time} method={time ? breakEndMethod(r) : null} />
          )
        },
        meta: {
          label: 'Break End',
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
          <DataTableColumnHeader column={column} title="Punch Out" />
        ),
        cell: ({ row }) => {
          const r = row.original
          const time = formatGmtTime(r.punchOutGmt0)
          return (
            <PunchTimeCell time={time} method={time ? punchOutMethod(r) : null} />
          )
        },
        meta: {
          label: 'Punch Out',
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
          <DataTableColumnHeader column={column} title="Time Work" />
        ),
        cell: ({ row }) => {
          const v = row.original.timeWork
          return v === '00:00' ? '00:00' : v || '—'
        },
        meta: {
          label: 'Time Work',
          mono: true,
          exportValue: (r) => {
            const v = r.timeWork
            return v === '00:00' ? '00:00' : v ?? ''
          },
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'timeBreak',
        accessorFn: (row) => row.timeBreak ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time Break" />
        ),
        cell: ({ row }) => row.original.timeBreak || '—',
        meta: {
          label: 'Time Break',
          mono: true,
          exportValue: (r) => r.timeBreak ?? '',
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
    ]

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
            title="ACTIONS"
            className="w-full justify-end pr-0 text-xs uppercase tracking-wide"
          />
        ),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center justify-end gap-0.5">
              {Number(r.manualCreate) === 1 ? (
                <span
                  className="mr-1 hidden max-w-[4.5rem] truncate text-[9px] font-medium leading-tight text-sky-700 dark:text-sky-400 xl:inline"
                  title="Manual punch"
                >
                  Manual
                </span>
              ) : null}
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
                  aria-label={`View face recognition photos for ${r.usuario?.nombre ?? 'employee'}`}
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
                  aria-label={`View change log for ${r.usuario?.nombre ?? 'employee'}`}
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
                  aria-label={`Edit punch for ${r.usuario?.nombre ?? 'employee'}`}
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
                    aria-label={`Delete punch for ${r.usuario?.nombre ?? 'employee'}`}
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
                    aria-label={`Activate punch for ${r.usuario?.nombre ?? 'employee'}`}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                  </Button>
                ))}
            </div>
          )
        },
        meta: {
          label: 'ACTIONS',
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
    getEmployeeId,
    getThumbnailUuid,
    handleThumbnailSaved,
  ])

  const columnPinning = React.useMemo<ColumnPinningState>(
    () => ({
      left: ['employee'],
      right: showActions ? ['actions'] : [],
    }),
    [showActions],
  )

  React.useEffect(() => {
    setPageIndex(0)
  }, [debouncedSearch, debouncedDealers, selectedType, dateRange, pageSize, sorting])

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
      throwIfSrsFail(data, 'Failed to load punches for export')
      const parsed = ttkListAdapter.parseResponse(data as TtkListResponse, {
        pageIndex,
        pageSize: exportPageSize,
      })
      collected.push(...parsed.rows)
      totalRows = parsed.total
      pageIndex += 1
    } while (collected.length < totalRows && collected.length > 0)

    return collected
  }, [apiRequest, listExtra, queryEnabled, sorting])

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: ttkListAdapter,
    queryKey: [
      'ttk-list',
      'issues-datatable',
      debouncedSearch,
      debouncedDealers.slice().sort().join(','),
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
      selectedType,
    ],
    queryFn: async (params) => {
      const data = await apiRequest.getCustom('', undefined, params)
      throwIfSrsFail(data, 'Failed to load punch issues')
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
          ? `Punch restored for ${deleteTarget.employeeName}`
          : `Punch deleted for ${deleteTarget.employeeName}`,
      )
      setDeleteTarget(null)
    } catch (e: unknown) {
      toast.error(getSrsErrorMessage(e, 'Failed to update punch'))
    }
  }

  const emptyState = !filtersHydrated ? (
    <span className="text-xs text-muted-foreground">Loading filters…</span>
  ) : selectedDealers.length === 0 ? (
    <span className="text-xs text-muted-foreground">
      Select at least one dealer in the header.
    </span>
  ) : (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <AlertTriangle className="h-8 w-8 opacity-20" />
      <span className="text-xs">No records for the current filters.</span>
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
          tableId="issues-punches"
          columns={columns}
          columnPinning={columnPinning}
          data={rows}
          getRowId={(row) => String(row.id)}
          isLoading={isFetching}
          emptyState={emptyState}
          enableGlobalFilter={false}
          enableViewOptions
          enableExport
          exportFileName="punch-issues"
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
