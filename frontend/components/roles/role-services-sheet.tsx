'use client'

import * as React from 'react'
import { ArrowRight, Search, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useRoleServices, useSetRoleServices } from '@/hooks/use-role-services'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { RoleListRow, RoleServiceColumn, RoleServiceRow } from '@/lib/roles/roles-types'

/** Above this many services, "select all" asks before saving (plan E1.1). */
const CONFIRM_ABOVE = 10

export type RoleServicesSheetProps = {
  role: RoleListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type PendingBulk = { column: RoleServiceColumn; checked: boolean; ids: number[] }

/**
 * Services by role (legacy "Services & Prices Admin"): Create WO / Approve WO per service,
 * saved on every click, optionally applied to the role's users.
 */
export function RoleServicesSheet({ role, open, onOpenChange }: RoleServicesSheetProps) {
  const { t } = useTranslation()
  const idRol = role?.id ?? null
  const query = useRoleServices(idRol, open && idRol != null)
  const mutation = useSetRoleServices()
  const [search, setSearch] = React.useState('')
  const [applyUsers, setApplyUsers] = React.useState(true)
  const [pending, setPending] = React.useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = React.useState<PendingBulk | null>(null)

  // "Apply to users" starts ON on every opening (Ignacio, 13/10/2026). Legacy started off and kept
  // the last value; turning it off shows a warning (plan, deliberate difference 3).
  React.useEffect(() => {
    if (open) {
      setApplyUsers(true)
      setSearch('')
    }
  }, [open, idRol])

  const services = React.useMemo(() => query.data?.services ?? [], [query.data])
  const assignedUsers = query.data?.assignedUsers ?? 0
  const reason = query.data?.reason ?? null

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return services
    return services.filter((s) =>
      `${s.dealer} ${s.department} ${s.service}`.toLowerCase().includes(term),
    )
  }, [services, search])

  const key = (column: RoleServiceColumn, id: number) => `${column}:${id}`
  const markPending = (keys: string[], on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (on) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  const save = async (column: RoleServiceColumn, ids: number[], checked: boolean) => {
    if (!idRol || ids.length === 0) return
    const keys = ids.map((id) => key(column, id))
    markPending(keys, true)
    try {
      await mutation.mutateAsync({
        action: 'set',
        id_rol: idRol,
        ids_service: ids,
        type: column,
        checked,
        apply_users: applyUsers,
      })
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    } finally {
      markPending(keys, false)
    }
  }

  const flagOf = (row: RoleServiceRow, column: RoleServiceColumn) =>
    column === 'create' ? row.isCreateWo : row.isApproveWo

  // Checked only when every shown row is on (the shared Checkbox draws "indeterminate" with the same tick).
  const headerState = (column: RoleServiceColumn): boolean =>
    filtered.length > 0 && filtered.every((r) => flagOf(r, column))

  const requestBulk = (column: RoleServiceColumn, checked: boolean) => {
    const ids = filtered.map((r) => r.idService)
    if (ids.length === 0) return
    if (ids.length > CONFIRM_ABOVE) {
      setConfirmBulk({ column, checked, ids })
      return
    }
    void save(column, ids, checked)
  }

  const columnLabel = (column: RoleServiceColumn) =>
    column === 'create' ? t('roles.servicesColCreate') : t('roles.servicesColApprove')

  const busy = pending.size > 0

  const renderFlag = (row: RoleServiceRow, column: RoleServiceColumn) => {
    const k = key(column, row.idService)
    return (
      <Checkbox
        checked={flagOf(row, column)}
        disabled={pending.has(k)}
        aria-label={`${columnLabel(column)} · ${row.service}`}
        // Only disabled while saving: wait cursor, not not-allowed.
        className="cursor-pointer disabled:cursor-wait"
        onCheckedChange={(value) => {
          void save(column, [row.idService], value === true)
        }}
      />
    )
  }

  const renderHeaderCheck = (column: RoleServiceColumn) => (
    <div className="flex flex-col items-center gap-1">
      <span>{columnLabel(column)}</span>
      <Checkbox
        checked={headerState(column)}
        disabled={busy || filtered.length === 0}
        aria-label={t('roles.servicesCheckAll', { column: columnLabel(column) })}
        className={busy ? 'cursor-pointer disabled:cursor-wait' : 'cursor-pointer disabled:cursor-not-allowed'}
        onCheckedChange={(value) => requestBulk(column, value === true)}
      />
    </div>
  )

  let body: React.ReactNode
  if (query.isLoading) {
    body = <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.servicesLoading')}</p>
  } else if (query.error) {
    body = (
      <p className="py-8 text-center text-sm text-destructive" role="alert">
        {getSrsErrorMessage(query.error, t('roles.saveError'))}
      </p>
    )
  } else if (reason) {
    body = (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {reason === 'no_dealer' ? t('roles.servicesNoDealer') : t('roles.servicesNoProvider')}
      </p>
    )
  } else if (services.length === 0) {
    body = <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.servicesEmpty')}</p>
  } else if (filtered.length === 0) {
    body = <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.servicesNoResults')}</p>
  } else {
    body = (
      <div className="overflow-x-auto">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t('roles.servicesColDealer')}</TableHead>
              <TableHead>{t('roles.servicesColDepartment')}</TableHead>
              <TableHead>{t('roles.servicesColService')}</TableHead>
              <TableHead className="h-auto w-[96px] py-2 text-center">{renderHeaderCheck('create')}</TableHead>
              <TableHead className="h-auto w-[96px] py-2 text-center">{renderHeaderCheck('approve')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.idService}>
                <TableCell className="max-w-[180px] truncate text-sm">{row.dealer}</TableCell>
                <TableCell className="max-w-[140px] truncate text-sm">{row.department}</TableCell>
                <TableCell className="text-sm">{row.service}</TableCell>
                <TableCell className="text-center">{renderFlag(row, 'create')}</TableCell>
                <TableCell className="text-center">{renderFlag(row, 'approve')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
          <SheetTitle className="text-base">
            {t('roles.servicesTitle', { name: role?.nombre ?? '' })}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
            {role?.tipo === 2 ? (
              <Badge variant="outline" className="font-normal">
                {t('roles.typeExternal')}
              </Badge>
            ) : role?.tipo === 1 ? (
              <Badge variant="outline" className="font-normal">
                {t('roles.typeInternal')}
              </Badge>
            ) : null}
            <span className="text-muted-foreground">{t('roles.autosaveHint')}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
          <div className="flex items-start gap-3">
            <Switch
              id="role-services-apply-users"
              checked={applyUsers}
              onCheckedChange={setApplyUsers}
              className="mt-0.5 cursor-pointer"
            />
            <div className="min-w-0">
              <Label htmlFor="role-services-apply-users" className="cursor-pointer text-sm font-medium">
                {t('roles.servicesApplyUsers')}
              </Label>
              {applyUsers ? (
                <p className="text-xs text-muted-foreground">
                  {t('roles.servicesApplyUsersOn', { m: assignedUsers })}
                </p>
              ) : (
                <p
                  role="status"
                  className="mt-1 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {role?.tipo === 2
                      ? t('roles.servicesApplyUsersOffExternal')
                      : t('roles.servicesApplyUsersOffInternal')}
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              className="pl-9"
              placeholder={t('roles.servicesSearch')}
              aria-label={t('roles.servicesSearch')}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 sm:px-4">{body}</div>
      </SheetContent>

      <ConfirmActionDialog
        open={confirmBulk != null}
        onOpenChange={(o) => {
          if (!o) setConfirmBulk(null)
        }}
        tone="warning"
        title={
          confirmBulk
            ? applyUsers
              ? t('roles.servicesConfirmUsers', { n: confirmBulk.ids.length, m: assignedUsers })
              : t('roles.servicesConfirm', { n: confirmBulk.ids.length })
            : ''
        }
        description={confirmBulk ? `${columnLabel(confirmBulk.column)} · ${role?.nombre ?? ''}` : ''}
        confirmLabel={t('roles.servicesContinue')}
        confirmIcon={ArrowRight}
        cancelLabel={t('roles.cancel')}
        confirmVariant="default"
        pending={mutation.isPending}
        onConfirm={async () => {
          if (!confirmBulk) return
          const next = confirmBulk
          setConfirmBulk(null)
          await save(next.column, next.ids, next.checked)
        }}
      />
    </Sheet>
  )
}
