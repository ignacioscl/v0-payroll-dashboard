'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Check, Pencil, Plus, Tag, UserX } from 'lucide-react'
import { toast } from 'sonner'

import { SettingsItemDialog } from '@/components/expenses/settings-item-dialog'
import {
  DataTable,
  DataTableColumnHeader,
  useDataTableQuery,
  type DataTableColumnMeta,
  type DataTableServerAdapter,
} from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { Switch } from '@/components/ui/switch'
import { catalogQueryKey, useUpdateCatalogItem } from '@/hooks/use-expenses-catalog'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fetchCatalog, type CatalogItem, type CatalogKind, type Paginated } from '@/lib/srs-expenses-api'
import { cn } from '@/lib/utils'

const catalogAdapter: DataTableServerAdapter<CatalogItem, Paginated<CatalogItem>> = {
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

/** Una solapa de Settings (F1, T5.2): Name, Expenses, Last category (compañías), Active, Edit. */
export function SettingsCatalogTable({ kind, enabled }: { kind: CatalogKind; enabled: boolean }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const updateMut = useUpdateCatalogItem(kind)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'name', desc: false }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CatalogItem | null>(null)
  const [confirmActive, setConfirmActive] = React.useState<CatalogItem | null>(null)

  const columnPinning = React.useMemo(() => ({ left: [], right: [] }), [])
  const wrap = isMobile ? 'whitespace-normal break-words' : 'truncate'
  const isCompanies = kind === 'companies'

  const columns = React.useMemo<ColumnDef<CatalogItem>[]>(
    () => [
      {
        accessorKey: 'name',
        size: 260,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.name')} />,
        cell: ({ row }) => <span className={cn('block font-medium', wrap)}>{row.original.name}</span>,
        meta: { label: t('expenses.name') } satisfies DataTableColumnMeta<CatalogItem>,
      },
      {
        accessorKey: 'expensesCount',
        size: 110,
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
        size: 60,
        minSize: 48,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">{t('expenses.actions')}</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-7"
              onClick={(e) => {
                e.stopPropagation()
                setEditing(row.original)
                setDialogOpen(true)
              }}
            >
              <Pencil className="size-3.5" />
              <span className="sr-only">{t('expenses.edit')}</span>
            </Button>
          </div>
        ),
        meta: { label: t('expenses.actions'), headerClassName: 'px-1', cellClassName: 'px-1' } satisfies DataTableColumnMeta<CatalogItem>,
      },
    ],
    [t, wrap, isCompanies],
  )

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: catalogAdapter,
    queryKey: [...catalogQueryKey(kind), 'table'],
    queryFn: (params) =>
      fetchCatalog(kind, {
        page: Number(params.page) || 1,
        pageSize: Number(params.pageSize) || 25,
        term: typeof params.term === 'string' ? params.term : undefined,
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
        enableExport={false}
        toolbarTrailing={
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-3.5" />
            {isCompanies ? t('expenses.addCompany') : t('expenses.addCategory')}
          </Button>
        }
        density="compact"
        headerVariant="colored"
        emptyState={
          <div className="flex flex-col items-center gap-1 py-8 text-muted-foreground">
            <Tag className="size-8 opacity-40" />
            <p className="text-sm">{isCompanies ? t('expenses.emptyCompanies') : t('expenses.emptyCategories')}</p>
          </div>
        }
      />
      <SettingsItemDialog kind={kind} item={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
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
