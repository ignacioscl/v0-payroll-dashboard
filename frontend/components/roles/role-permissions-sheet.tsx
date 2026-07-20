'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useRolePermissions } from '@/hooks/use-role-permissions'
import { useSetRolePermission } from '@/hooks/use-set-role-permission'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { RoleListRow } from '@/lib/roles/roles-types'
import { Info } from 'lucide-react'

export type RolePermissionsSheetProps = {
  role: RoleListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit: boolean
}

export function RolePermissionsSheet({
  role,
  open,
  onOpenChange,
  canEdit,
}: RolePermissionsSheetProps) {
  const { t } = useTranslation()
  const idRol = role?.id ?? null
  const query = useRolePermissions(idRol, open && idRol != null)
  const mutation = useSetRolePermission()
  const [pendingIds, setPendingIds] = React.useState<Set<number>>(new Set())

  const permissions = query.data?.permissions ?? []
  const allAssigned =
    permissions.length > 0 && permissions.every((p) => p.assigned)
  const someAssigned = permissions.some((p) => p.assigned)

  const setPending = (ids: number[], on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const toggleOne = async (id: number, checked: boolean) => {
    if (!canEdit || !idRol || pendingIds.has(id)) return
    setPending([id], true)
    try {
      await mutation.mutateAsync({
        id_rol: idRol,
        ids_rol_accion: [id],
        checked,
      })
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    } finally {
      setPending([id], false)
    }
  }

  const toggleAll = async (checked: boolean) => {
    if (!canEdit || !idRol || permissions.length === 0) return
    const ids = permissions.map((p) => p.id)
    setPending(ids, true)
    try {
      await mutation.mutateAsync({
        id_rol: idRol,
        ids_rol_accion: ids,
        checked,
      })
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    } finally {
      setPending(ids, false)
    }
  }

  const tipoLabel =
    role?.tipo === 1
      ? t('roles.typeInternal')
      : role?.tipo === 2
        ? t('roles.typeExternal')
        : role?.tipoTxt

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-4 py-4 pr-12 text-left">
          <SheetTitle className="text-base">
            {t('roles.permissionsTitle', { name: role?.nombre ?? '' })}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
            {tipoLabel ? (
              <Badge variant="outline" className="font-normal">
                {tipoLabel}
              </Badge>
            ) : null}
            {!canEdit ? (
              <span className="text-muted-foreground">{t('roles.readOnlyHint')}</span>
            ) : (
              <span className="text-muted-foreground">{t('roles.autosaveHint')}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="roles-check-all"
              checked={allAssigned ? true : someAssigned ? 'indeterminate' : false}
              disabled={!canEdit || query.isLoading || permissions.length === 0 || pendingIds.size > 0}
              onCheckedChange={(value) => {
                void toggleAll(value === true)
              }}
            />
            <Label htmlFor="roles-check-all" className="text-sm font-medium">
              {t('roles.checkAll')}
            </Label>
          </div>
        </div>

        <ScrollArea className="flex-1 px-4">
          {query.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.loadingPermissions')}</p>
          ) : permissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.emptyPermissions')}</p>
          ) : (
            <TooltipProvider delayDuration={200}>
              <ul className="space-y-1 py-3">
                {permissions.map((perm) => {
                  const busy = pendingIds.has(perm.id)
                  return (
                    <li
                      key={perm.id}
                      className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/60"
                    >
                      <Checkbox
                        id={`perm-${perm.id}`}
                        checked={perm.assigned}
                        disabled={!canEdit || busy}
                        className="mt-0.5"
                        onCheckedChange={(value) => {
                          void toggleOne(perm.id, value === true)
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <Label
                          htmlFor={`perm-${perm.id}`}
                          className="text-sm font-normal leading-snug"
                        >
                          {perm.nombre}
                        </Label>
                        {perm.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
                                aria-label={t('roles.permissionInfo')}
                              >
                                <Info className="size-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {perm.description}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </TooltipProvider>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
