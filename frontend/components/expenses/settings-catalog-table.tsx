'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Check, Merge, MoreHorizontal, Pencil, Plus, Tag, Trash2, UserX } from 'lucide-react'
import { toast } from 'sonner'

import { SettingsItemDialog } from '@/components/expenses/settings-item-dialog'
import { SettingsMergeDialog } from '@/components/expenses/settings-merge-dialog'
import { Badge } from '@/components/ui/badge'
import {
  DataTable,
  DataTableColumnHeader,
  useDataTableQuery,
  type DataTableColumnMeta,
  type DataTableServerAdapter,
} from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { catalogQueryKey, useDeleteCatalogItem, useUpdateCatalogItem } from '@/hooks/use-expenses-catalog'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fetchCatalog, type CatalogItem, type CatalogKind, type CatalogPage } from '@/lib/srs-expenses-api'
import { cn } from '@/lib/utils'

const catalogAdapter: DataTableServerAdapter<CatalogItem, CatalogPage> = {
  buildRequest: (ctx) => ({
    page: ctx.pageIndex + 1,
    pageSize: ctx.pageSize,
    ...(ctx.globalFilter?.trim() ? { term: ctx.globalFilter.trim() } : {}),
  }),
  parseResponse: (raw, { pageSize }) => {
    const total = raw.total ?? 0
    return {
      rows: raw.data ?? [],
      total,
      pageCount: Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
      meta: { groups: raw.groups ?? 0 },
    }
  },
}

/**
 * Una solapa de Settings (F1, T5.2): Name, Expenses, Last category (compañías), Active, Edit y «⋯» (Merge into…,
 * Delete). Abre con las activas; «Show inactive» muestra solo las inactivas, como Roles (plan-expenses-settings §2).
 * «Possible duplicates» muestra solo los nombres parecidos, activas e inactivas juntas, en el orden que manda el
 * backend; toda inactiva lleva la etiqueta «Inactive» (plans/plan-expenses-posibles-duplicados, T3).
 */
export function SettingsCatalogTable({ kind, enabled }: { kind: CatalogKind; enabled: boolean }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const updateMut = useUpdateCatalogItem(kind)
  const deleteMut = useDeleteCatalogItem(kind)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'name', desc: false }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [showDuplicates, setShowDuplicates] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CatalogItem | null>(null)
  const [confirmActive, setConfirmActive] = React.useState<CatalogItem | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<CatalogItem | null>(null)
  const [merging, setMerging] = React.useState<CatalogItem | null>(null)

  const columnPinning = React.useMemo(() => ({ left: [], right: [] }), [])
  const wrap = isMobile ? 'whitespace-normal break-words' : 'truncate'
  const isCompanies = kind === 'companies'

  const columns = React.useMemo<ColumnDef<CatalogItem>[]>(
    () => [
      {
        accessorKey: 'name',
        size: 260,
        // Con «Possible duplicates» el orden lo pone el backend (grupos juntos, activas primero): no se reordena.
        enableSorting: !showDuplicates,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.name')} />,
        cell: ({ row }) => (
          <div className={cn('flex min-w-0 items-center gap-1.5', isMobile && 'flex-wrap')}>
            <span className={cn('min-w-0 font-medium', wrap)}>{row.original.name}</span>
            {row.original.active ? null : (
              <Badge
                variant="outline"
                className="shrink-0 cursor-default px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
              >
                {t('expensesCatalog.inactiveTag')}
              </Badge>
            )}
          </div>
        ),
        meta: { label: t('expenses.name') } satisfies DataTableColumnMeta<CatalogItem>,
      },
      {
        accessorKey: 'expensesCount',
        size: 110,
        enableSorting: !showDuplicates,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.expensesColumn')} />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.expensesCount.toLocaleString()}</span>,
        meta: { label: t('expenses.expensesColumn'), numeric: true } satisfies DataTableColumnMeta<CatalogItem>,
      },
      ...(isCompanies
        ? [
            {
              id: 'lastCategory',
              accessorFn: (r: CatalogItem) => r.lastCategory?.name ?? '',
              size: 200,
              enableSorting: false,
              header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.lastCategory')} />,
              cell: ({ row }) => (
                <span className={cn('block text-muted-foreground', wrap)}>
                  {row.original.lastCategory
                    ? `${row.original.lastCategory.name}${row.original.lastCategory.active ? '' : ` ${t('expenses.inactiveSuffix')}`}`
                    : '—'}
                </span>
              ),
              meta: { label: t('expenses.lastCategory') } satisfies DataTableColumnMeta<CatalogItem>,
            } satisfies ColumnDef<CatalogItem>,
          ]
        : []),
      {
        accessorKey: 'active',
        size: 100,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.active')} />,
        cell: ({ row }) => (
          <Switch
            checked={row.original.active}
            className="cursor-pointer"
            aria-label={`${row.original.name}: ${t('expenses.active')}`}
            onCheckedChange={() => setConfirmActive(row.original)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        meta: { label: t('expenses.active') } satisfies DataTableColumnMeta<CatalogItem>,
      },
      {
        id: 'actions',
        size: 80,
        minSize: 72,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">{t('expenses.actions')}</span>,
        cell: ({ row }) => {
          const r = row.original
          const deleteItem = (
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              disabled={!r.deletable}
              onClick={() => setConfirmDelete(r)}
            >
              <Trash2 className="size-4" />
              {t('expenses.delete')}
            </DropdownMenuItem>
          )
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-7 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(r)
                  setDialogOpen(true)
                }}
              >
                <Pencil className="size-3.5" />
                <span className="sr-only">{t('expenses.edit')}</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="size-7 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">{t('expenses.actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-72" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setMerging(r)}>
                    <Merge className="size-4" />
                    {t('expensesCatalog.mergeInto')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {r.deletable ? (
                    deleteItem
                  ) : isMobile ? (
                    <>
                      {deleteItem}
                      <p className="px-2 pb-1.5 text-xs text-muted-foreground">{t('expensesCatalog.deleteDisabledHint')}</p>
                    </>
                  ) : (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>{deleteItem}</div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs whitespace-pre-wrap break-words">
                          {t('expensesCatalog.deleteDisabledHint')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
        meta: { label: t('expenses.actions'), headerClassName: 'px-1', cellClassName: 'px-1' } satisfies DataTableColumnMeta<CatalogItem>,
      },
    ],
    [t, wrap, isCompanies, isMobile, showDuplicates],
  )

  const mode = showDuplicates ? 'duplicates' : showInactive ? 'inactive' : 'active'
  const { rows, total, pageCount, isFetching, error, meta } = useDataTableQuery({
    adapter: catalogAdapter,
    queryKey: [...catalogQueryKey(kind), 'table', mode],
    queryFn: (params) =>
      fetchCatalog(kind, {
        page: Number(params.page) || 1,
        pageSize: Number(params.pageSize) || 25,
        term: typeof params.term === 'string' ? params.term : undefined,
        ...(mode === 'duplicates'
          ? { duplicatesOnly: true }
          : mode === 'inactive'
            ? { inactiveOnly: true }
            : { activeOnly: true }),
      }),
    enabled,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    globalFilter,
  })

  const runToggle = async () => {
    if (!confirmActive) return
    try {
      await updateMut.mutateAsync({ id: confirmActive.id, active: !confirmActive.active })
      toast.success(t('expenses.toastSettingsSaved'))
      setConfirmActive(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const runDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteMut.mutateAsync(confirmDelete.id)
      toast.success(t('expensesCatalog.toastDeleted'))
      setConfirmDelete(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const groups = Number(meta?.groups ?? 0)
  const emptyText = showDuplicates
    ? t('expensesCatalog.emptyDuplicates')
    : showInactive
    ? isCompanies
      ? t('expensesCatalog.emptyInactiveCompanies')
      : t('expensesCatalog.emptyInactiveCategories')
    : isCompanies
      ? t('expenses.emptyCompanies')
      : t('expenses.emptyCategories')

  return (
    <div className="min-w-0 space-y-2">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DataTable<CatalogItem>
        tableId={isCompanies ? 'expenses.settings.companies.v1' : 'expenses.settings.categories.v1'}
        columns={columns}
        data={rows}
        isLoading={isFetching}
        getRowId={(r) => String(r.id)}
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
        sorting={sorting}
        onSortingChange={setSorting}
        enableGlobalFilter
        globalFilter={globalFilter}
        onGlobalFilterChange={(next) => {
          setGlobalFilter(next)
          setPageIndex(0)
        }}
        manualFiltering
        manualSorting={showDuplicates}
        zebraRows={!showDuplicates}
        getRowClassName={(r) => (showDuplicates && (r.duplicateGroup ?? 0) % 2 === 1 ? 'bg-muted/50' : undefined)}
        recordsCountNote={
          showDuplicates && groups > 0 ? (
            <span className="text-xs text-muted-foreground" data-testid="expenses-settings-duplicate-groups">
              {t('expensesCatalog.duplicatesGroups', { n: groups })}
            </span>
          ) : undefined
        }
        toolbarTrailing={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id={`expenses-settings-${kind}-duplicates`}
                className="cursor-pointer"
                checked={showDuplicates}
                onCheckedChange={(next) => {
                  setShowDuplicates(next)
                  if (next) setShowInactive(false)
                  setPageIndex(0)
                }}
              />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor={`expenses-settings-${kind}-duplicates`} className="cursor-pointer text-sm font-normal">
                      {t('expensesCatalog.showDuplicates')}
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
                    {t('expensesCatalog.duplicatesHelp')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={`expenses-settings-${kind}-inactive`}
                className="cursor-pointer"
                checked={showInactive}
                disabled={showDuplicates}
                onCheckedChange={(next) => {
                  setShowInactive(next)
                  setPageIndex(0)
                }}
              />
              <Label
                htmlFor={`expenses-settings-${kind}-inactive`}
                className={cn('cursor-pointer text-sm font-normal', showDuplicates && 'cursor-not-allowed opacity-50')}
              >
                {t('expensesCatalog.showInactive')}
              </Label>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-7 cursor-pointer gap-1 px-2 text-[11px]"
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              {isCompanies ? t('expenses.addCompany') : t('expenses.addCategory')}
            </Button>
          </div>
        }
        density="compact"
        headerVariant="colored"
        emptyState={
          <div className="flex flex-col items-center gap-1 py-8 text-muted-foreground">
            <Tag className="size-8 opacity-40" />
            <p className="text-sm">{emptyText}</p>
          </div>
        }
      />
      <SettingsItemDialog kind={kind} item={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
      <SettingsMergeDialog kind={kind} item={merging} onOpenChange={(o) => (!o ? setMerging(null) : undefined)} />
      <ConfirmActionDialog
        open={confirmDelete != null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null)
        }}
        tone="danger"
        title={confirmDelete ? t('expensesCatalog.deleteTitle', { name: confirmDelete.name }) : ''}
        description={t('expensesCatalog.deleteHint')}
        confirmLabel={t('expensesCatalog.yesDelete')}
        confirmIcon={Trash2}
        cancelLabel={t('expenses.cancel')}
        pending={deleteMut.isPending}
        onConfirm={() => void runDelete()}
      />
      <ConfirmActionDialog
        open={confirmActive != null}
        onOpenChange={(o) => {
          if (!o) setConfirmActive(null)
        }}
        tone={confirmActive?.active ? 'warning' : 'success'}
        title={
          confirmActive
            ? confirmActive.active
              ? t('expenses.deactivateTitle', { name: confirmActive.name })
              : t('expenses.activateTitle', { name: confirmActive.name })
            : ''
        }
        description={confirmActive?.active ? t('expenses.deactivateHint') : ''}
        confirmLabel={confirmActive?.active ? t('expenses.yesChange') : t('expenses.yesChange')}
        confirmIcon={confirmActive?.active ? UserX : Check}
        confirmVariant={confirmActive?.active ? 'destructive' : 'default'}
        cancelLabel={t('expenses.cancel')}
        pending={updateMut.isPending}
        onConfirm={() => void runToggle()}
      />
    </div>
  )
}
