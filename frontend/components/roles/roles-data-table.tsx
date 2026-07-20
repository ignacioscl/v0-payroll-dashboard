'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  Check,
  MoreHorizontal,
  Pencil,
  Shield,
  Trash2,
  UserX,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  DataTable,
  DataTableColumnHeader,
  createPaginatedAdapter,
  useDataTableQuery,
  type DataTableColumnMeta,
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
import { useRolesListFetcher } from '@/hooks/use-roles-list'
import { useRoleAction } from '@/hooks/use-role-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { RoleListRow } from '@/lib/roles/roles-types'

const rolesAdapter = createPaginatedAdapter<RoleListRow>()

export type RolesDataTableProps = {
  typeFilter: string
  showInactive: boolean
  enabled: boolean
  canEdit: boolean
  canViewUsers: boolean
  onOpenPermissions: (role: RoleListRow) => void
  onEdit: (role: RoleListRow) => void
  onAccessLevel: (role: RoleListRow) => void
  onViewUsers: (role: RoleListRow) => void
}

export function RolesDataTable({
  typeFilter,
  showInactive,
  enabled,
  canEdit,
  canViewUsers,
  onOpenPermissions,
  onEdit,
  onAccessLevel,
  onViewUsers,
}: RolesDataTableProps) {
  const { t } = useTranslation()
  const fetchRoles = useRolesListFetcher()
  const roleAction = useRoleAction()

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'nombre', desc: false }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [confirm, setConfirm] = React.useState<{
    role: RoleListRow
    action: 'inactivate' | 'activate' | 'delete'
  } | null>(null)

  React.useEffect(() => {
    setPageIndex(0)
  }, [typeFilter, showInactive])

  const runConfirm = async () => {
    if (!confirm) return
    try {
      await roleAction.mutateAsync({
        id_rol: confirm.role.id,
        action: confirm.action,
      })
      toast.success(
        confirm.action === 'delete'
          ? t('roles.deleteSuccess')
          : confirm.action === 'activate'
            ? t('roles.activateSuccess')
            : t('roles.inactivateSuccess'),
      )
      setConfirm(null)
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    }
  }

  const columns = React.useMemo<ColumnDef<RoleListRow>[]>(
    () => [
      {
        accessorKey: 'nombre',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.colName')} />
        ),
        meta: { label: t('roles.colName'), sortKey: 'r.nombre' } satisfies DataTableColumnMeta<RoleListRow>,
      },
      {
        accessorKey: 'departmentNombre',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.colDepartment')} />
        ),
        meta: { label: t('roles.colDepartment') } satisfies DataTableColumnMeta<RoleListRow>,
      },
      {
        accessorKey: 'dealerText',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.colDealer')} />
        ),
        meta: { label: t('roles.colDealer') } satisfies DataTableColumnMeta<RoleListRow>,
      },
      {
        accessorKey: 'companyTxt',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.colCompany')} />
        ),
        meta: { label: t('roles.colCompany') } satisfies DataTableColumnMeta<RoleListRow>,
      },
      {
        accessorKey: 'tipoTxt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.colType')} />
        ),
        cell: ({ row }) => {
          const tipo = row.original.tipo
          const label =
            tipo === 1
              ? t('roles.typeInternal')
              : tipo === 2
                ? t('roles.typeExternal')
                : row.original.tipoTxt
          return (
            <Badge variant={tipo === 1 ? 'secondary' : 'outline'} className="font-normal">
              {label}
            </Badge>
          )
        },
        meta: { label: t('roles.colType'), sortKey: 'r.tipo' } satisfies DataTableColumnMeta<RoleListRow>,
      },
      {
        accessorKey: 'ponderacion',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.accessLevel')} />
        ),
        cell: ({ row }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 tabular-nums text-sm hover:underline disabled:no-underline"
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation()
              onAccessLevel(row.original)
            }}
          >
            {row.original.ponderacion ?? '—'}
            {canEdit ? <Pencil className="size-3 opacity-50" /> : null}
          </button>
        ),
        meta: {
          label: t('roles.accessLevel'),
          sortKey: 'r.ponderacion',
          numeric: true,
        } satisfies DataTableColumnMeta<RoleListRow>,
      },
      {
        accessorKey: 'cantPerm',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.colPermissions')} />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.cantPerm}</span>
        ),
        meta: {
          label: t('roles.colPermissions'),
          numeric: true,
        } satisfies DataTableColumnMeta<RoleListRow>,
      },
      {
        id: 'actions',
        size: 72,
        minSize: 64,
        maxSize: 80,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">{t('roles.actions')}</span>,
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
                      className="size-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenPermissions(r)
                      }}
                    >
                      <Shield className="size-3.5" />
                      <span className="sr-only">{t('roles.permissions')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('roles.permissions')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {(canEdit || canViewUsers) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">{t('roles.actions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    {canEdit ? (
                      <DropdownMenuItem onClick={() => onEdit(r)}>
                        <Pencil className="size-4" />
                        {t('roles.edit')}
                      </DropdownMenuItem>
                    ) : null}
                    {canViewUsers ? (
                      <DropdownMenuItem onClick={() => onViewUsers(r)}>
                        <Users className="size-4" />
                        {t('roles.viewUsers')}
                      </DropdownMenuItem>
                    ) : null}
                    {canEdit ? (
                      <>
                        <DropdownMenuSeparator />
                        {r.estado === 1 ? (
                          <DropdownMenuItem onClick={() => setConfirm({ role: r, action: 'inactivate' })}>
                            <UserX className="size-4" />
                            {t('roles.setInactive')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setConfirm({ role: r, action: 'activate' })}>
                            <Check className="size-4" />
                            {t('roles.setActive')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setConfirm({ role: r, action: 'delete' })}
                        >
                          <Trash2 className="size-4" />
                          {t('roles.delete')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        },
        meta: {
          label: t('roles.actions'),
          pin: 'right',
          headerClassName: 'px-1',
          cellClassName: 'px-1',
        } satisfies DataTableColumnMeta<RoleListRow>,
      },
    ],
    [
      t,
      canEdit,
      canViewUsers,
      onOpenPermissions,
      onEdit,
      onAccessLevel,
      onViewUsers,
    ],
  )

  const extra = React.useMemo(
    () => ({
      type: typeFilter || undefined,
      show_inactive: showInactive ? 1 : 0,
    }),
    [typeFilter, showInactive],
  )

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: rolesAdapter,
    queryKey: ['roles-list', typeFilter, showInactive],
    queryFn: fetchRoles,
    enabled,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    globalFilter,
    extra,
  })

  return (
    <div className="min-w-0 space-y-2">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DataTable<RoleListRow>
        tableId="roles.list.v2"
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
            <Shield className="size-8 opacity-40" />
            <p className="text-sm">{t('roles.empty')}</p>
          </div>
        }
        toolbarTrailing={
          canEdit ? null : (
            <span className="text-xs text-muted-foreground">{t('roles.readOnlyHint')}</span>
          )
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
            ? t('roles.deleteConfirmTitle')
            : confirm?.action === 'activate'
              ? t('roles.activateConfirmTitle')
              : t('roles.inactivateConfirmTitle')
        }
        description={
          confirm
            ? t(
                confirm.action === 'delete'
                  ? 'roles.deleteConfirmDesc'
                  : confirm.action === 'activate'
                    ? 'roles.activateConfirmDesc'
                    : 'roles.inactivateConfirmDesc',
                { name: confirm.role.nombre },
              )
            : ''
        }
        confirmLabel={
          confirm?.action === 'delete'
            ? t('roles.delete')
            : confirm?.action === 'activate'
              ? t('roles.setActive')
              : t('roles.setInactive')
        }
        cancelLabel={t('roles.cancel')}
        confirmVariant={confirm?.action === 'delete' ? 'destructive' : 'default'}
        pending={roleAction.isPending}
        onConfirm={runConfirm}
      />
    </div>
  )
}
