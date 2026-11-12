'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  History,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Receipt,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { ExpenseAttachmentDialog } from '@/components/expenses/expense-attachment-dialog'
import { ExpenseDetailSheet } from '@/components/expenses/expense-detail-sheet'
import { ExpenseFormDialog, type ExpenseFormTarget } from '@/components/expenses/expense-form-dialog'
import { ExpenseLogSheet } from '@/components/expenses/expense-log-sheet'
import { ExpenseStatusBadge } from '@/components/expenses/expense-status-badge'
import {
  DataTable,
  DataTableColumnHeader,
  useDataTableQuery,
  type DataTableColumnMeta,
  type DataTableServerAdapter,
} from '@/components/shared/data-table'
import { ServerXlsxExportButton } from '@/components/shared/server-xlsx-export-button'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { EXPENSES_LIST_KEY, useExpenseRowAction, type ExpenseRowAction } from '@/hooks/use-expenses-list'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  fmtAmount,
  fmtYmd,
  rowAmount,
  rowAttachmentLocation,
  rowDetailId,
  rowKey,
} from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  expenseListExportUrl,
  fetchExpenseList,
  type ExpenseListFilters,
  type ExpenseRow,
  type Paginated,
} from '@/lib/srs-expenses-api'
import { cn } from '@/lib/utils'

/** `GET /srs/expenses` usa `page` base 1, `sort` + `dir` y `{ data, total }`. */
const expensesAdapter: DataTableServerAdapter<ExpenseRow, Paginated<ExpenseRow>> = {
  buildRequest: (ctx) => {
    const sort = ctx.sorting[0]
    const col = sort ? ctx.columns.find((c) => (c.id ?? (c as { accessorKey?: string }).accessorKey) === sort.id) : undefined
    const sortKey = (col?.meta as DataTableColumnMeta<ExpenseRow> | undefined)?.sortKey ?? sort?.id
    return {
      page: ctx.pageIndex + 1,
      pageSize: ctx.pageSize,
      ...(sortKey ? { sort: sortKey, dir: sort?.desc ? 'desc' : 'asc' } : {}),
      ...ctx.extra,
    }
  },
  parseResponse: (raw, { pageSize }) => {
    const total = raw.total ?? 0
    return { rows: raw.data ?? [], total, pageCount: Math.max(1, Math.ceil(total / Math.max(1, pageSize))) }
  },
}

export type ExpensesDataTableProps = {
  /** null mientras los filtros del header no están listos. */
  filters: ExpenseListFilters | null
  canApprove: boolean
  canEdit: boolean
}

type Confirm = { row: ExpenseRow; action: ExpenseRowAction['action'] }

export function ExpensesDataTable({ filters, canApprove, canEdit }: ExpensesDataTableProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const rowAction = useExpenseRowAction()

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'ticketDate', desc: true }])
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  const [detailRow, setDetailRow] = React.useState<ExpenseRow | null>(null)
  const [logRow, setLogRow] = React.useState<ExpenseRow | null>(null)
  const [attachmentRow, setAttachmentRow] = React.useState<ExpenseRow | null>(null)
  const [editTarget, setEditTarget] = React.useState<ExpenseFormTarget | null>(null)

  React.useEffect(() => {
    setPageIndex(0)
  }, [filters])

  const columnPinning = React.useMemo(
    () => (isMobile ? { left: [], right: [] } : { left: [], right: ['actions'] }),
    [isMobile],
  )
  const wrap = isMobile ? 'whitespace-normal break-words' : 'truncate'

  const openEdit = React.useCallback(
    (row: ExpenseRow) => {
      const id = rowDetailId(row)
      if (id != null) setEditTarget({ kind: 'edit', id })
    },
    [],
  )

  const columns = React.useMemo<ColumnDef<ExpenseRow>[]>(
    () => [
      {
        accessorKey: 'ticketDate',
        size: 110,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colDate')} />,
        cell: ({ row }) => <span className="tabular-nums">{fmtYmd(row.original.ticketDate)}</span>,
        meta: { label: t('expenses.colDate'), sortKey: 'date' } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'company',
        accessorFn: (r) => r.company.name,
        size: 180,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colCompany')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{row.original.company.name}</span>,
        meta: { label: t('expenses.colCompany'), sortKey: 'company' } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'category',
        accessorFn: (r) => r.category.name,
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colCategory')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{row.original.category.name}</span>,
        meta: { label: t('expenses.colCategory'), sortKey: 'category' } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'dealer',
        accessorFn: (r) => (r.kind === 'group' ? '' : r.dealer.name),
        size: 200,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colBranch')} />,
        cell: ({ row }) => {
          const r = row.original
          if (r.kind === 'single') return <span className={cn('block', wrap)}>{r.dealer.name}</span>
          const label =
            r.visibleRows < r.totalRows
              ? t('expenses.allBranchesPartial', { k: r.visibleRows, n: r.totalRows })
              : t('expenses.allBranches', { n: r.totalRows })
          const expanded = row.getIsExpanded()
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                row.toggleExpanded()
              }}
              aria-expanded={expanded}
              aria-label={expanded ? t('expenses.collapseGroup') : t('expenses.expandGroup')}
              className={cn('flex min-w-0 cursor-pointer items-center gap-1 text-left font-medium', wrap)}
            >
              {expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
              <span className={wrap}>{label}</span>
            </button>
          )
        },
        meta: { label: t('expenses.colBranch'), sortKey: 'dealer' } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'amount',
        accessorFn: (r) => rowAmount(r),
        size: 120,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colAmount')} />,
        cell: ({ row }) => <span className="font-medium tabular-nums">{fmtAmount(rowAmount(row.original))}</span>,
        meta: { label: t('expenses.colAmount'), numeric: true, money: true, sortKey: 'amount' } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'author',
        accessorFn: (r) => r.author?.name ?? '',
        size: 160,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colAssignedTo')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{row.original.author?.name ?? '—'}</span>,
        meta: { label: t('expenses.colAssignedTo'), sortKey: 'author' } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'createdBy',
        accessorFn: (r) => r.createdBy?.name ?? '',
        size: 160,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colCreatedBy')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{row.original.createdBy?.name ?? '—'}</span>,
        meta: { label: t('expenses.colCreatedBy'), sortKey: 'createdBy' } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colStatus')} />,
        cell: ({ row }) => <ExpenseStatusBadge row={row.original} />,
        meta: { label: t('expenses.colStatus'), sortKey: 'status' } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'description',
        accessorFn: (r) => r.description ?? '',
        size: 220,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colDescription')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{row.original.description ?? ''}</span>,
        meta: { label: t('expenses.colDescription') } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'receiptNumber',
        accessorFn: (r) => r.receiptNumber ?? '',
        size: 120,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colReceipt')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{row.original.receiptNumber ?? ''}</span>,
        meta: { label: t('expenses.colReceipt') } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'notes',
        accessorFn: (r) => r.notes ?? '',
        size: 220,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colNotes')} />,
        cell: ({ row }) => {
          const notes = row.original.notes ?? ''
          if (!notes) return null
          if (isMobile) return <span className="block whitespace-normal break-words">{notes}</span>
          return (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block cursor-default truncate">{notes}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap break-words">
                  {notes}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        meta: { label: t('expenses.colNotes') } satisfies DataTableColumnMeta<ExpenseRow>,
      },
      {
        id: 'actions',
        size: 96,
        minSize: 80,
        maxSize: 120,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">{t('expenses.actions')}</span>,
        cell: ({ row }) => {
          const r = row.original
          const readOnly = r.kind === 'group' && r.readOnly
          // Pendientes de un grupo = visibles - aprobadas - rechazadas (contrato 02/11).
          const hasPending =
            r.kind === 'group' ? r.visibleRows - r.approvedCount - r.rejectedCount > 0 : r.status === 'pending'
          const writable = !readOnly && !r.deleted
          const canEditRow = canEdit && writable && !(r.kind === 'single' && r.status === 'approved')
          const editButton = (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-7"
              disabled={!canEditRow}
              onClick={(e) => {
                e.stopPropagation()
                openEdit(r)
              }}
            >
              <Pencil className="size-3.5" />
              <span className="sr-only">{t('expenses.edit')}</span>
            </Button>
          )
          return (
            <div className="flex items-center justify-end gap-0.5">
              {canEdit ? (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{editButton}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {readOnly ? t('expenses.partialTooltip') : t('expenses.edit')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="size-7" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">{t('expenses.actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setDetailRow(r)}>
                    <Eye className="size-4" />
                    {t('expenses.view')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setLogRow(r)}>
                    <History className="size-4" />
                    {t('expenses.log')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setAttachmentRow(r)}>
                    <Paperclip className="size-4" />
                    {t('expenses.attachment')}
                  </DropdownMenuItem>
                  {(canApprove || canEdit) && !r.deleted ? <DropdownMenuSeparator /> : null}
                  {canApprove && !r.deleted ? (
                    <>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        disabled={!writable || !hasPending}
                        onClick={() => setConfirm({ row: r, action: 'approve' })}
                      >
                        <Check className="size-4" />
                        {t('expenses.approve')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        disabled={!writable || !hasPending}
                        onClick={() => setConfirm({ row: r, action: 'reject' })}
                      >
                        <X className="size-4" />
                        {t('expenses.reject')}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {canEdit && !r.deleted ? (
                    <DropdownMenuItem
                      className="cursor-pointer text-destructive focus:text-destructive"
                      disabled={!writable}
                      onClick={() => setConfirm({ row: r, action: 'delete' })}
                    >
                      <Trash2 className="size-4" />
                      {t('expenses.delete')}
                    </DropdownMenuItem>
                  ) : null}
                  {canEdit && r.deleted ? (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={readOnly}
                      onClick={() => setConfirm({ row: r, action: 'restore' })}
                    >
                      <RotateCcw className="size-4" />
                      {t('expenses.restore')}
                    </DropdownMenuItem>
                  ) : null}
                  {readOnly ? (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{t('expenses.partialTooltip')}</div>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
        meta: {
          label: t('expenses.actions'),
          pin: isMobile ? undefined : 'right',
          headerClassName: 'px-1',
          cellClassName: 'px-1',
        } satisfies DataTableColumnMeta<ExpenseRow>,
      },
    ],
    [t, isMobile, wrap, canApprove, canEdit, openEdit],
  )

  const extra = React.useMemo(() => {
    if (!filters) return {}
    const out: Record<string, string | number | undefined> = {}
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null || v === '') continue
      out[k] = v as string | number
    }
    return out
  }, [filters])

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: expensesAdapter,
    queryKey: [...EXPENSES_LIST_KEY, filters],
    queryFn: (params) =>
      fetchExpenseList({
        ...(filters ?? {}),
        page: Number(params.page) || 1,
        pageSize: Number(params.pageSize) || 25,
        sort: typeof params.sort === 'string' ? params.sort : undefined,
        dir: params.dir === 'desc' ? 'desc' : params.dir === 'asc' ? 'asc' : undefined,
      }),
    enabled: filters !== null,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    extra,
  })

  const runConfirm = async () => {
    if (!confirm) return
    const { row, action } = confirm
    try {
      const target =
        row.kind === 'group' ? ({ kind: 'group', groupId: row.groupId } as const) : ({ kind: 'single', id: row.id } as const)
      await rowAction.mutateAsync({ action, target })
      toast.success(
        action === 'delete'
          ? t('expenses.toastDeleted')
          : action === 'approve'
            ? t('expenses.toastApproved')
            : action === 'reject'
              ? t('expenses.toastRejected')
              : t('expenses.toastRestored'),
      )
      setConfirm(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const confirmTitle = (c: Confirm): string => {
    const group = c.row.kind === 'group' ? c.row : null
    const n = group ? group.visibleRows : 0
    const pending = group ? group.visibleRows - group.approvedCount - group.rejectedCount : 0
    switch (c.action) {
      case 'delete':
        return group ? t('expenses.deleteGroupTitle', { n }) : t('expenses.deleteOneTitle')
      case 'approve':
        return group ? t('expenses.approveGroupTitle', { n: pending }) : t('expenses.approveOneTitle')
      case 'reject':
        return group ? t('expenses.rejectGroupTitle', { n: pending }) : t('expenses.rejectOneTitle')
      default:
        return group ? t('expenses.restoreGroupTitle', { n }) : t('expenses.restoreOneTitle')
    }
  }
  const confirmLabel = (c: Confirm): string =>
    c.action === 'delete'
      ? t('expenses.yesDelete')
      : c.action === 'approve'
        ? t('expenses.yesApprove')
        : c.action === 'reject'
          ? t('expenses.yesReject')
          : t('expenses.yesRestore')

  const attachmentLocation = attachmentRow ? rowAttachmentLocation(attachmentRow) : null

  return (
    <div className="min-w-0 space-y-2">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DataTable<ExpenseRow>
        tableId="expenses.list.v1"
        columns={columns}
        data={rows}
        isLoading={isFetching}
        getRowId={rowKey}
        columnPinning={columnPinning}
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
        manualSorting
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next)
          setPageIndex(0)
        }}
        manualFiltering
        enableGlobalFilter={false}
        enableExport={false}
        exportAction={
          <ServerXlsxExportButton
            url={filters ? expenseListExportUrl(filters) : null}
            rowCount={total}
            fallbackFileName="expenses.xlsx"
            disabled={isFetching || total === 0}
          />
        }
        recordsCount={total}
        recordsCountLabel={t('expenses.expensesCount').toLowerCase()}
        renderSubComponent={(row) => <GroupRows row={row.original} wrap={wrap} />}
        getRowCanExpand={(row) => row.original.kind === 'group'}
        subComponentLayout="full"
        density="compact"
        headerVariant="colored"
        emptyState={
          <div className="flex flex-col items-center gap-1 py-8 text-muted-foreground">
            <Receipt className="size-8 opacity-40" />
            <p className="text-sm">{t('expenses.emptyExpenses')}</p>
          </div>
        }
      />

      <ConfirmActionDialog
        open={confirm != null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null)
        }}
        tone={confirm?.action === 'delete' || confirm?.action === 'reject' ? 'danger' : confirm?.action === 'approve' ? 'success' : 'info'}
        title={confirm ? confirmTitle(confirm) : ''}
        description={
          confirm
            ? t('expenses.confirmHint', {
                company: confirm.row.company.name,
                amount: fmtAmount(rowAmount(confirm.row)),
                date: fmtYmd(confirm.row.ticketDate),
              })
            : ''
        }
        confirmLabel={confirm ? confirmLabel(confirm) : ''}
        confirmIcon={
          confirm?.action === 'delete' ? Trash2 : confirm?.action === 'approve' ? Check : confirm?.action === 'reject' ? X : RotateCcw
        }
        confirmVariant={confirm?.action === 'approve' || confirm?.action === 'restore' ? 'default' : 'destructive'}
        cancelLabel={t('expenses.cancel')}
        pending={rowAction.isPending}
        onConfirm={() => void runConfirm()}
      />

      <ExpenseDetailSheet row={detailRow} open={detailRow != null} onOpenChange={(o) => !o && setDetailRow(null)} />
      <ExpenseLogSheet
        expenseId={logRow ? rowDetailId(logRow) : null}
        title={logRow ? `${logRow.company.name} · ${fmtAmount(rowAmount(logRow))} · ${fmtYmd(logRow.ticketDate)}` : ''}
        open={logRow != null}
        onOpenChange={(o) => !o && setLogRow(null)}
      />
      <ExpenseAttachmentDialog
        open={attachmentRow != null}
        onOpenChange={(o) => !o && setAttachmentRow(null)}
        location={attachmentLocation}
        title={attachmentRow ? `${attachmentRow.company.name} · ${fmtAmount(rowAmount(attachmentRow))} · ${fmtYmd(attachmentRow.ticketDate)}` : ''}
        canUpload={canEdit && !(attachmentRow?.kind === 'group' && attachmentRow.readOnly) && !attachmentRow?.deleted}
      />
      <ExpenseFormDialog target={editTarget} onClose={() => setEditTarget(null)} />
    </div>
  )
}

/** Filas por dealer de un gasto repartido (las visibles para el usuario). */
function GroupRows({ row, wrap }: { row: ExpenseRow; wrap: string }) {
  const { t } = useTranslation()
  if (row.kind !== 'group') return null
  return (
    <div className="min-w-0 px-3 py-2">
      {row.readOnly ? (
        <p className="mb-1.5 text-[11px] text-amber-700">{t('expenses.partialTooltip')}</p>
      ) : null}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-3 font-medium">{t('expenses.colBranch')}</th>
            <th className="py-1 pr-3 text-right font-medium">{t('expenses.colAmount')}</th>
            <th className="py-1 pr-3 font-medium">{t('expenses.colAssignedTo')}</th>
            <th className="py-1 font-medium">{t('expenses.colStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {row.rows.map((r) => (
            <tr key={r.id} className="border-t border-border/50">
              <td className={cn('py-1 pr-3', wrap)}>{r.dealer.name}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtAmount(r.amount)}</td>
              <td className={cn('py-1 pr-3', wrap)}>{r.author?.name ?? '—'}</td>
              <td className="py-1">
                <ExpenseStatusBadge row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
