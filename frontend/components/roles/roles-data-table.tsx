'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  Check,
  ClipboardList,
  History,
  Layers,
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
import { Checkbox } from '@/components/ui/checkbox'
import { AssignAllServicesDialog } from '@/components/roles/assign-all-services-dialog'
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
import { useFilters } from '@/lib/filter-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { RoleListRow } from '@/lib/roles/roles-types'

const rolesAdapter = createPaginatedAdapter<RoleListRow>()

export type RolesDataTableProps = {
  typeFilter: string
  /** When set, list only roles created from this ROL_TEMPLATE. */
  idTemplate?: number | null
  showInactive: boolean
  /** With a dealer selected in the header: also list internal roles without dealer. */
  includeNoDealer: boolean
  enabled: boolean
  canEdit: boolean
  canViewUsers: boolean
  /** Roles Admin > Role Templates (144): with canEdit, shows «Assign template» on roles without template. */
  canManageTemplates: boolean
  onOpenPermissions: (role: RoleListRow) => void
  onEdit: (role: RoleListRow) => void
  onAssignTemplate: (role: RoleListRow) => void
  onAccessLevel: (role: RoleListRow) => void
  onViewUsers: (role: RoleListRow) => void
  onViewActivity: (role: RoleListRow) => void
  onOpenServices: (role: RoleListRow) => void
}

export function RolesDataTable({
  typeFilter,
  idTemplate = null,
  showInactive,
  includeNoDealer,
  enabled,
  canEdit,
  canViewUsers,
  canManageTemplates,
  onOpenPermissions,
  onEdit,
  onAssignTemplate,
  onAccessLevel,
  onViewUsers,
  onViewActivity,
  onOpenServices,
}: RolesDataTableProps) {
  const { t } = useTranslation()
  const { selectedDealers } = useFilters()
  const fetchRoles = useRolesListFetcher()
  const roleAction = useRoleAction()

  const dealerKey = React.useMemo(
    () => selectedDealers.slice().sort().join(','),
    [selectedDealers],
  )

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'nombre', desc: false }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [confirm, setConfirm] = React.useState<{
    role: RoleListRow
    action: 'inactivate' | 'activate' | 'delete'
  } | null>(null)

  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({})
  const [assignOpen, setAssignOpen] = React.useState(false)

  React.useEffect(() => {
    setPageIndex(0)
  }, [typeFilter, showInactive, dealerKey, idTemplate, includeNoDealer])

  // Selection is per visible page, like legacy (getRolesChecked on the DataTable page).
  React.useEffect(() => {
    setRowSelection({})
  }, [typeFilter, showInactive, dealerKey, idTemplate, includeNoDealer, pageIndex, pageSize])

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
      ...(canEdit
        ? [
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
                  aria-label={t('roles.selectAllRoles')}
                  className="cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              ),
              cell: ({ row }) => (
                <Checkbox
                  checked={row.getIsSelected()}
                  onCheckedChange={(value) => row.toggleSelected(!!value)}
                  aria-label={t('roles.selectRole')}
                  className="cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              ),
              meta: {
                label: t('roles.selectRole'),
                pin: 'left',
                exportable: false,
                headerClassName: 'w-[40px] px-2',
                cellClassName: 'px-2',
              } satisfies DataTableColumnMeta<RoleListRow>,
            } satisfies ColumnDef<RoleListRow>,
          ]
        : []),
      {
        accessorKey: 'nombre',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.colName')} />
        ),
        cell: ({ row }) => (
          <div className="min-w-0 truncate font-medium">{row.original.nombre}</div>
        ),
        meta: { label: t('roles.colName'), sortKey: 'r.nombre' } satisfies DataTableColumnMeta<RoleListRow>,
      },
      {
        // Template del rol (o «—»): reemplaza la línea «Based on: …» que iba debajo del nombre.
        id: 'templateNombre',
        accessorFn: (r) =>
          r.idTemplate && r.idTemplate > 0 ? (r.templateNombre ?? String(r.idTemplate)) : '—',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('roles.basedOnFilter')} />
        ),
        cell: ({ getValue }) => (
          <span className="block min-w-0 truncate">{String(getValue())}</span>
        ),
        meta: { label: t('roles.basedOnFilter') } satisfies DataTableColumnMeta<RoleListRow>,
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
        cell: ({ row }) => {
          const r = row.original
          const templated = Boolean(r.idTemplate && r.idTemplate > 0)
          return (
          <button
            type="button"
            className="inline-flex items-center gap-1 tabular-nums text-sm hover:underline disabled:no-underline"
            disabled={!canEdit || templated}
            onClick={(e) => {
              e.stopPropagation()
              onAccessLevel(row.original)
            }}
          >
            {row.original.ponderacion ?? '—'}
            {canEdit && !templated ? <Pencil className="size-3 opacity-50" /> : null}
          </button>
          )
        },
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
          const templated = Boolean(r.idTemplate && r.idTemplate > 0)
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
              {/* Activity está en todos los roles, con o sin template: el menú siempre se ve. */}
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
                  <DropdownMenuItem onClick={() => onViewActivity(r)}>
                    <History className="size-4" />
                    {t('roles.activity')}
                  </DropdownMenuItem>
                  {/* Rol de template: Edit solo cambia el nombre (permisos y nivel vienen del template). */}
                  {canEdit ? (
                    <DropdownMenuItem onClick={() => onEdit(r)}>
                      <Pencil className="size-4" />
                      {t('roles.edit')}
                    </DropdownMenuItem>
                  ) : null}
                  {canEdit && canManageTemplates && !templated ? (
                    <DropdownMenuItem onClick={() => onAssignTemplate(r)}>
                      <Layers className="size-4" />
                      {t('roles.assignTemplate')}
                    </DropdownMenuItem>
                  ) : null}
                  {canEdit && r.hasServices !== false ? (
                    <DropdownMenuItem onClick={() => onOpenServices(r)}>
                      <ClipboardList className="size-4" />
                      {t('roles.services')}
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
      canManageTemplates,
      onOpenPermissions,
      onEdit,
      onAssignTemplate,
      onAccessLevel,
      onViewUsers,
      onViewActivity,
      onOpenServices,
    ],
  )

  const extra = React.useMemo(
    () => ({
      type: typeFilter || undefined,
      show_inactive: showInactive ? 1 : 0,
      ...(dealerKey ? { id_dealer: dealerKey, include_no_dealer: includeNoDealer ? 1 : 0 } : {}),
      ...(idTemplate && idTemplate > 0 ? { id_template: idTemplate } : {}),
    }),
    [typeFilter, showInactive, dealerKey, idTemplate, includeNoDealer],
  )

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: rolesAdapter,
    queryKey: ['roles-list', typeFilter, showInactive, dealerKey, idTemplate, includeNoDealer],
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

  const selectedExternalIds = React.useMemo(
    () => rows.filter((r) => rowSelection[String(r.id)] && r.tipo === 2).map((r) => r.id),
    [rows, rowSelection],
  )

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
        enableRowSelection={canEdit}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        recordsCountNote={
          canEdit && selectedExternalIds.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-2 h-7 gap-1.5 text-xs"
              onClick={() => setAssignOpen(true)}
            >
              <ClipboardList className="size-3.5" />
              {t('roles.assignAllServices')} ({selectedExternalIds.length})
            </Button>
          ) : null
        }
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
        // No Excel: it only took the visible page and legacy has no list export (decision B,
        // plans/plan-report-info-exports-tablas).
        enableExport={false}
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

      <AssignAllServicesDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        roleIds={selectedExternalIds}
        onDone={() => setRowSelection({})}
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
        confirmIcon={
          confirm?.action === 'delete'
            ? Trash2
            : confirm?.action === 'activate'
              ? Check
              : UserX
        }
        cancelLabel={t('roles.cancel')}
        confirmVariant={confirm?.action === 'delete' ? 'destructive' : 'default'}
        pending={roleAction.isPending}
        onConfirm={runConfirm}
      />
    </div>
  )
}
