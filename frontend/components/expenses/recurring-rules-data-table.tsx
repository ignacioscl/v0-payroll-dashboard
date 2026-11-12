'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { AlertTriangle, FileSpreadsheet, MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  DataTable,
  DataTableColumnHeader,
  useDataTableQuery,
  type DataTableColumnMeta,
  type DataTableServerAdapter,
} from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { RULES_LIST_KEY, useDeleteRule } from '@/hooks/use-recurring-rules'
import { downloadServerXlsx } from '@/lib/download-xlsx'
import { fmtAmount, fmtYmd, frequencyLabel, splitLabel } from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fetchRules, ruleDealersExportUrl, type RuleListResponse, type RuleRow } from '@/lib/srs-expenses-api'
import { cn } from '@/lib/utils'

const rulesAdapter: DataTableServerAdapter<RuleRow, RuleListResponse> = {
  buildRequest: (ctx) => ({
    page: ctx.pageIndex + 1,
    pageSize: ctx.pageSize,
    ...(ctx.globalFilter?.trim() ? { term: ctx.globalFilter.trim() } : {}),
  }),
  parseResponse: (raw, { pageSize }) => {
    const total = raw.total ?? 0
    return { rows: raw.data ?? [], total, pageCount: Math.max(1, Math.ceil(total / Math.max(1, pageSize))) }
  },
}

export function RecurringRulesDataTable({
  enabled,
  onCards,
  onEdit,
  onGenerateExpense,
}: {
  enabled: boolean
  onCards?: (cards: RuleListResponse['cards']) => void
  onEdit: (id: number) => void
  /** «Generate expense from this recurring expense»: Add Expense precargado con la regla. Sin él, no se muestra. */
  onGenerateExpense?: (ruleId: number) => void
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const deleteMut = useDeleteRule()
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [confirmDelete, setConfirmDelete] = React.useState<RuleRow | null>(null)
  const [exporting, setExporting] = React.useState<number | null>(null)

  const columnPinning = React.useMemo(
    () => (isMobile ? { left: [], right: [] } : { left: ['description'], right: ['actions'] }),
    [isMobile],
  )
  const wrap = isMobile ? 'whitespace-normal break-words' : 'truncate'

  const exportDealers = React.useCallback(
    async (rule: RuleRow) => {
      setExporting(rule.id)
      try {
        await downloadServerXlsx(ruleDealersExportUrl(rule.id), `recurring_expense_${rule.id}_dealers.xlsx`)
      } catch {
        toast.error(t('common.exportFailed'))
      } finally {
        setExporting(null)
      }
    },
    [t],
  )

  const columns = React.useMemo<ColumnDef<RuleRow>[]>(
    () => [
      {
        accessorKey: 'description',
        size: 220,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.ruleDescription')} />,
        cell: ({ row }) => {
          const warnings = row.original.warnings ?? []
          const icon = <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
          return (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn('min-w-0 font-medium', wrap)}>{row.original.description}</span>
                {warnings.length && !isMobile ? (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex shrink-0 rounded-sm" aria-label={warnings.join(' ')}>
                          {icon}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap break-words">
                        {warnings.join('\n')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </span>
              {/* En celular no hay hover: el aviso va escrito debajo, como las notas en Expenses List. */}
              {warnings.length && isMobile
                ? warnings.map((w) => (
                    <span key={w} className="flex items-start gap-1 whitespace-normal break-words text-xs text-amber-700">
                      {icon}
                      {w}
                    </span>
                  ))
                : null}
            </div>
          )
        },
        meta: {
          label: t('expenses.ruleDescription'),
          // Fija en la compu; en celular ninguna columna fija (regla data-table).
          pin: isMobile ? undefined : 'left',
        } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        id: 'company',
        accessorFn: (r) => r.company.name,
        size: 170,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.company')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{row.original.company.name}</span>,
        meta: { label: t('expenses.company') } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        id: 'category',
        accessorFn: (r) => r.category.name,
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.category')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{row.original.category.name}</span>,
        meta: { label: t('expenses.category') } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        accessorKey: 'amount',
        size: 120,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.ruleAmount')} />,
        cell: ({ row }) => <span className="tabular-nums">{fmtAmount(row.original.amount)}</span>,
        meta: { label: t('expenses.ruleAmount'), numeric: true, money: true } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        accessorKey: 'splitType',
        size: 130,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.split')} />,
        cell: ({ row }) => <Badge variant="outline" className="font-normal">{splitLabel(t, row.original.splitType)}</Badge>,
        meta: { label: t('expenses.split') } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        accessorKey: 'frequency',
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.frequency')} />,
        cell: ({ row }) => <span className={cn('block', wrap)}>{frequencyLabel(t, row.original)}</span>,
        meta: { label: t('expenses.frequency') } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        accessorKey: 'startDate',
        size: 110,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.startDate')} />,
        cell: ({ row }) => <span className="tabular-nums">{fmtYmd(row.original.startDate)}</span>,
        meta: { label: t('expenses.startDate') } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        accessorKey: 'endDate',
        size: 110,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.endDate')} />,
        cell: ({ row }) =>
          row.original.endDate ? (
            <span className="tabular-nums">{fmtYmd(row.original.endDate)}</span>
          ) : (
            <span className="text-muted-foreground">{t('expenses.forever')}</span>
          ),
        meta: { label: t('expenses.endDate') } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        accessorKey: 'dealersCount',
        size: 90,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.dealers')} />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.dealersCount}</span>,
        meta: { label: t('expenses.dealers'), numeric: true } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        accessorKey: 'nextRun',
        size: 110,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.nextRun')} />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.nextRun ? fmtYmd(row.original.nextRun) : '—'}</span>,
        meta: { label: t('expenses.nextRun') } satisfies DataTableColumnMeta<RuleRow>,
      },
      {
        accessorKey: 'active',
        size: 100,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.status')} />,
        cell: ({ row }) => (
          <Badge variant={row.original.active ? 'secondary' : 'outline'} className="font-normal">
            {row.original.active ? t('expenses.active') : t('expenses.statusDeleted')}
          </Badge>
        ),
        meta: { label: t('expenses.status') } satisfies DataTableColumnMeta<RuleRow>,
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
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(r.id)
                }}
              >
                <Pencil className="size-3.5" />
                <span className="sr-only">{t('expenses.edit')}</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="size-7" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">{t('expenses.actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {onGenerateExpense ? (
                    <DropdownMenuItem className="cursor-pointer" onClick={() => onGenerateExpense(r.id)}>
                      <Plus className="size-4" />
                      {t('expenses.generateExpenseFromRule')}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem className="cursor-pointer" disabled={exporting === r.id} onClick={() => void exportDealers(r)}>
                    <FileSpreadsheet className="size-4" />
                    {t('expenses.exportDealers')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={() => setConfirmDelete(r)}
                  >
                    <Trash2 className="size-4" />
                    {t('expenses.delete')}
                  </DropdownMenuItem>
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
        } satisfies DataTableColumnMeta<RuleRow>,
      },
    ],
    [t, wrap, isMobile, onEdit, onGenerateExpense, exporting, exportDealers],
  )

  const [cards, setCards] = React.useState<RuleListResponse['cards'] | null>(null)
  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: rulesAdapter,
    queryKey: [...RULES_LIST_KEY],
    queryFn: async (params) => {
      const res = await fetchRules({
        page: Number(params.page) || 1,
        pageSize: Number(params.pageSize) || 25,
        term: typeof params.term === 'string' ? params.term : undefined,
      })
      setCards(res.cards)
      return res
    },
    enabled,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    globalFilter,
  })

  React.useEffect(() => {
    if (cards && onCards) onCards(cards)
  }, [cards, onCards])

  const runDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteMut.mutateAsync(confirmDelete.id)
      toast.success(t('expenses.toastRuleDeleted'))
      setConfirmDelete(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DataTable<RuleRow>
        tableId="expenses.recurring.v1"
        columns={columns}
        data={rows}
        isLoading={isFetching}
        getRowId={(r) => String(r.id)}
        columnPinning={columnPinning}
        onRowClick={(r) => onEdit(r.id)}
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
        sorting={sorting}
        onSortingChange={setSorting}
        enableGlobalFilter
        globalFilter={globalFilter}
        onGlobalFilterChange={(next) => {
          setGlobalFilter(next)
          setPageIndex(0)
        }}
        manualFiltering
        enableExport={false}
        density="compact"
        headerVariant="colored"
        emptyState={
          <div className="flex flex-col items-center gap-1 py-8 text-muted-foreground">
            <Repeat className="size-8 opacity-40" />
            <p className="text-sm">{t('expenses.emptyRules')}</p>
          </div>
        }
      />
      <ConfirmActionDialog
        open={confirmDelete != null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null)
        }}
        tone="danger"
        title={t('expenses.deleteRuleTitle')}
        description={confirmDelete ? `${confirmDelete.description} — ${t('expenses.deleteRuleHint')}` : ''}
        confirmLabel={t('expenses.yesDelete')}
        confirmIcon={Trash2}
        cancelLabel={t('expenses.cancel')}
        pending={deleteMut.isPending}
        onConfirm={() => void runDelete()}
      />
    </div>
  )
}
