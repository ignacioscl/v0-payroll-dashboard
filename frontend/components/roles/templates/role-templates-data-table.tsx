'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  Check,
  History,
  Layers,
  MoreHorizontal,
  Pencil,
  Shield,
  Trash2,
  UserPlus,
  UserX,
} from 'lucide-react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  useDeleteRoleTemplate,
  useUpdateRoleTemplate,
} from '@/hooks/use-role-template-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  fetchRoleTemplateList,
  type RoleTemplateListResponse,
  type RoleTemplateRow,
} from '@/lib/srs-role-templates-api'

/** Nest `/srs/role-templates` uses 0-based `page` + `{ data, total, lastPage }`. */
const templatesAdapter: DataTableServerAdapter<RoleTemplateRow, RoleTemplateListResponse> = {
  buildRequest: (ctx) => ({
    page: ctx.pageIndex,
    pageSize: ctx.pageSize,
    ...(ctx.globalFilter?.trim() ? { term: ctx.globalFilter.trim() } : {}),
    ...ctx.extra,
  }),
  parseResponse: (raw, { pageSize }) => {
    const total = raw.total ?? 0
    const pageCount = Math.max(
      1,
      raw.lastPage != null && raw.lastPage > 0
        ? raw.lastPage
        : Math.ceil(total / Math.max(1, pageSize)),
    )
    return {
      rows: raw.data ?? [],
      total,
      pageCount,
    }
  },
}

export type RoleTemplatesDataTableProps = {
  typeFilter: 'all' | '1' | '2'
  showInactive: boolean
  enabled: boolean
  onOpenPermissions: (row: RoleTemplateRow) => void
  onEdit: (row: RoleTemplateRow) => void
  onOpenRoles: (row: RoleTemplateRow) => void
  onOpenActivity: (row: RoleTemplateRow) => void
}

export function RoleTemplatesDataTable({
  typeFilter,
  showInactive,
  enabled,
  onOpenPermissions,
  onEdit,
  onOpenRoles,
  onOpenActivity,
}: RoleTemplatesDataTableProps) {
  const { t } = useTranslation()
  const deleteMut = useDeleteRoleTemplate()
  const updateMut = useUpdateRoleTemplate()

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'nombre', desc: false }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [confirm, setConfirm] = React.useState<{
    template: RoleTemplateRow
    action: 'delete' | 'activate' | 'inactivate'
  } | null>(null)

  React.useEffect(() => {
    setPageIndex(0)
  }, [typeFilter, showInactive])

  const columns = React.useMemo<ColumnDef<RoleTemplateRow>[]>(
    () => [
      {
        accessorKey: 'nombre',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roleTemplates.colName')} />
        ),
        meta: {
          label: t('roleTemplates.colName'),
        } satisfies DataTableColumnMeta<RoleTemplateRow>,
      },
      {
        accessorKey: 'tipo',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roleTemplates.colType')} />
        ),
        cell: ({ row }) => (
          <Badge
            variant={row.original.tipo === 1 ? 'secondary' : 'outline'}
            className="font-normal"
          >
            {row.original.tipo === 1
              ? t('roleTemplates.typeInternal')
              : t('roleTemplates.typeExternal')}
          </Badge>
        ),
        meta: { label: t('roleTemplates.colType') } satisfies DataTableColumnMeta<RoleTemplateRow>,
      },
      {
        accessorKey: 'ponderacion',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roleTemplates.colAccessLevel')} />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.ponderacion ?? '—'}</span>
        ),
        meta: {
          label: t('roleTemplates.colAccessLevel'),
          numeric: true,
        } satisfies DataTableColumnMeta<RoleTemplateRow>,
      },
      {
        accessorKey: 'cantPerm',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roleTemplates.colPerms')} />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.cantPerm}</span>
        ),
        meta: {
          label: t('roleTemplates.colPerms'),
          numeric: true,
        } satisfies DataTableColumnMeta<RoleTemplateRow>,
      },
      {
        accessorKey: 'cantRoles',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roleTemplates.colRoles')} />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.cantRoles}</span>
        ),
        meta: {
          label: t('roleTemplates.colRoles'),
          numeric: true,
        } satisfies DataTableColumnMeta<RoleTemplateRow>,
      },
      {
        accessorKey: 'estado',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roleTemplates.colEstado')} />
        ),
        cell: ({ row }) => (
          <Badge
            variant={row.original.estado === 1 ? 'secondary' : 'outline'}
            className="font-normal"
          >
            {row.original.estado === 1
              ? t('roleTemplates.estado')
              : t('roleTemplates.setInactive')}
          </Badge>
        ),
        meta: { label: t('roleTemplates.colEstado') } satisfies DataTableColumnMeta<RoleTemplateRow>,
      },
      {
        id: 'actions',
        size: 72,
        minSize: 64,
        maxSize: 80,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">{t('roleTemplates.actions')}</span>,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center justify-end gap-0.5">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-7 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenPermissions(r)
                      }}
                    >
                      <Shield className="size-3.5" />
                      <span className="sr-only">{t('roleTemplates.permissions')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('roleTemplates.permissions')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">{t('roleTemplates.actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit(r)}>
                    <Pencil className="size-4" />
                    {t('roleTemplates.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => onOpenRoles(r)}>
                    <UserPlus className="size-4" />
                    {t('roleTemplates.createRoles')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => onOpenActivity(r)}>
                    <History className="size-4" />
                    {t('roleTemplates.activity')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {r.estado === 1 ? (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setConfirm({ template: r, action: 'inactivate' })}
                    >
                      <UserX className="size-4" />
                      {t('roleTemplates.setInactive')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setConfirm({ template: r, action: 'activate' })}
                    >
                      <Check className="size-4" />
                      {t('roleTemplates.setActive')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={() => setConfirm({ template: r, action: 'delete' })}
                  >
                    <Trash2 className="size-4" />
                    {t('roleTemplates.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
        meta: {
          label: t('roleTemplates.actions'),
          pin: 'right',
          headerClassName: 'px-1',
          cellClassName: 'px-1',
        } satisfies DataTableColumnMeta<RoleTemplateRow>,
      },
    ],
    [t, onOpenPermissions, onEdit, onOpenRoles, onOpenActivity],
  )

  const extra = React.useMemo(
    () => ({
      ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
      estado: showInactive ? '0' : '1',
    }),
    [typeFilter, showInactive],
  )

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: templatesAdapter,
    queryKey: ['role-templates-list', typeFilter, showInactive],
    queryFn: async (params) =>
      fetchRoleTemplateList({
        page: Number(params.page) || 0,
        pageSize: Number(params.pageSize) || 25,
        type: params.type === '1' || params.type === '2' ? params.type : undefined,
        estado: params.estado === '0' || params.estado === '1' ? params.estado : undefined,
        term: typeof params.term === 'string' ? params.term : undefined,
      }),
    enabled,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    globalFilter,
    extra,
  })

  const runConfirm = async () => {
    if (!confirm) return
    try {
      if (confirm.action === 'delete') {
        await deleteMut.mutateAsync(confirm.template.id)
        toast.success(t('roleTemplates.deleteSuccess'))
      } else {
        await updateMut.mutateAsync({
          id: confirm.template.id,
          payload: { estado: confirm.action === 'activate' ? 1 : 0 },
        })
        toast.success(
          confirm.action === 'activate'
            ? t('roleTemplates.activateSuccess')
            : t('roleTemplates.inactivateSuccess'),
        )
      }
      setConfirm(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('roleTemplates.deleteError')
      toast.error(
        confirm.action === 'delete' && /still has|based on it|Cannot delete/i.test(msg)
          ? t('roleTemplates.deleteBlocked')
          : msg,
      )
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DataTable<RoleTemplateRow>
        tableId="roles.templates.v1"
        columns={columns}
        data={rows}
        isLoading={isFetching}
        getRowId={(r) => String(r.id)}
        onRowClick={onOpenPermissions}
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
        enableGlobalFilter
        globalFilter={globalFilter}
        onGlobalFilterChange={(next) => {
          setGlobalFilter(next)
          setPageIndex(0)
        }}
        manualFiltering
        density="compact"
        headerVariant="colored"
        emptyState={
          <div className="flex flex-col items-center gap-1 py-8 text-muted-foreground">
            <Layers className="size-8 opacity-40" />
            <p className="text-sm">{t('roleTemplates.empty')}</p>
          </div>
        }
      />

      <ConfirmActionDialog
        open={confirm != null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null)
        }}
        tone={confirm?.action === 'delete' ? 'danger' : 'warning'}
        title={
          confirm?.action === 'delete'
            ? t('roleTemplates.deleteConfirmTitle')
            : confirm?.action === 'activate'
              ? t('roleTemplates.activateConfirmTitle')
              : t('roleTemplates.inactivateConfirmTitle')
        }
        description={
          confirm
            ? t(
                confirm.action === 'delete'
                  ? 'roleTemplates.deleteConfirmDesc'
                  : confirm.action === 'activate'
                    ? 'roleTemplates.activateConfirmDesc'
                    : 'roleTemplates.inactivateConfirmDesc',
                { name: confirm.template.nombre },
              )
            : ''
        }
        confirmLabel={
          confirm?.action === 'delete'
            ? t('roleTemplates.delete')
            : confirm?.action === 'activate'
              ? t('roleTemplates.setActive')
              : t('roleTemplates.setInactive')
        }
        confirmIcon={
          confirm?.action === 'delete'
            ? Trash2
            : confirm?.action === 'activate'
              ? Check
              : UserX
        }
        cancelLabel={t('roleTemplates.cancel')}
        pending={deleteMut.isPending || updateMut.isPending}
        onConfirm={() => void runConfirm()}
      />
    </div>
  )
}
