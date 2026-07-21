'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
import { groupRolePermissions } from '@/lib/roles/group-role-permissions.mjs'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { RoleListRow } from '@/lib/roles/roles-types'
import { Info, Search } from 'lucide-react'

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
  const [searchState, setSearchState] = React.useState<{
    roleId: number | null
    value: string
  }>({ roleId: null, value: '' })

  const permissions = query.data?.permissions ?? []
  const searchTerm = searchState.roleId === idRol ? searchState.value : ''
  const permissionGroups = React.useMemo(
    () => groupRolePermissions(permissions, searchTerm, t('roles.otherPermissions')),
    [permissions, searchTerm, t],
  )

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

  const tipoLabel =
    role?.tipo === 1
      ? t('roles.typeInternal')
      : role?.tipo === 2
        ? t('roles.typeExternal')
        : role?.tipoTxt

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setSearchState({ roleId: null, value: '' })
        }
        onOpenChange(nextOpen)
      }}
    >
      <SheetContent
        side="right"
        className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
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

        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={searchTerm}
              className="pl-9"
              placeholder={t('roles.searchPermissions')}
              aria-label={t('roles.searchPermissions')}
              onChange={(event) => {
                setSearchState({
                  roleId: idRol,
                  value: event.target.value,
                })
              }}
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-4">
          {query.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.loadingPermissions')}</p>
          ) : permissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.emptyPermissions')}</p>
          ) : permissionGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('roles.noPermissionResults')}
            </p>
          ) : (
            <TooltipProvider delayDuration={200}>
              <div className="space-y-4 py-3">
                {permissionGroups.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    <h3 className="sticky top-0 z-10 border-b border-border bg-background/95 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                      {group.label}
                    </h3>
                    <ul className="space-y-1 pt-1">
                      {group.permissions.map((perm) => {
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
                                {perm.displayName}
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
                  </section>
                ))}
              </div>
            </TooltipProvider>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
