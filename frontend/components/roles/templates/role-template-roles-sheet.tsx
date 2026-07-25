'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Plus, Trash2, UserPlus, UserX, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import {
  useCreateRolesFromTemplate,
  useDeleteRoleTemplateRole,
  useRoleTemplateRoles,
  useSetRoleTemplateRoleEstado,
} from '@/hooks/use-role-template-roles'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RoleTemplateChildRole, RoleTemplateRow } from '@/lib/srs-role-templates-api'

export type RoleTemplateRolesSheetProps = {
  template: RoleTemplateRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleTemplateRolesSheet({
  template,
  open,
  onOpenChange,
}: RoleTemplateRolesSheetProps) {
  const { t } = useTranslation()
  const id = template?.id ?? null
  const query = useRoleTemplateRoles(id, open && id != null)
  const createMut = useCreateRolesFromTemplate()
  const deleteMut = useDeleteRoleTemplateRole()
  const estadoMut = useSetRoleTemplateRoleEstado()
  const { dealers } = useSrsDealers()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [selectedDealers, setSelectedDealers] = React.useState<number[]>([])
  const [confirm, setConfirm] = React.useState<{
    role: RoleTemplateChildRole
    action: 'activate' | 'inactivate' | 'delete'
  } | null>(null)

  React.useEffect(() => {
    if (!open) {
      setCreateOpen(false)
      setSelectedDealers([])
      setConfirm(null)
    }
  }, [open])

  const roles = query.data?.results ?? []
  const usedDealerIds = new Set(
    roles.map((r) => r.idDealer).filter((n): n is number => n != null && n > 0),
  )
  const availableDealers = dealers.filter((d) => !usedDealerIds.has(Number(d.id)))

  const blockSheetDismiss = createOpen || confirm != null

  const onCreateInternal = async () => {
    if (!id) return
    try {
      await createMut.mutateAsync({ id, payload: {} })
      toast.success(t('roleTemplates.createSuccess'))
      setCreateOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('roleTemplates.createError'))
    }
  }

  const onCreateExternal = async () => {
    if (!id || selectedDealers.length === 0) return
    try {
      await createMut.mutateAsync({ id, payload: { idDealers: selectedDealers } })
      toast.success(t('roleTemplates.createSuccess'))
      setCreateOpen(false)
      setSelectedDealers([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('roleTemplates.createError'))
    }
  }

  const onConfirmAction = async () => {
    if (!id || !confirm) return
    try {
      if (confirm.action === 'delete') {
        await deleteMut.mutateAsync({ id, idRol: confirm.role.id })
        toast.success(t('roleTemplates.roleDeleteSuccess'))
      } else {
        const next: 0 | 1 = confirm.action === 'activate' ? 1 : 0
        await estadoMut.mutateAsync({ id, idRol: confirm.role.id, estado: next })
        toast.success(
          next === 1 ? t('roles.activateSuccess') : t('roles.inactivateSuccess'),
        )
      }
      setConfirm(null)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : confirm.action === 'delete'
            ? t('roleTemplates.roleDeleteError')
            : t('roleTemplates.roleEstadoError'),
      )
    }
  }

  const isInternal = template?.tipo === 1
  const hasInternalChild = roles.some((r) => r.tipo === 1)

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          onInteractOutside={(e) => {
            if (blockSheetDismiss) e.preventDefault()
          }}
          onPointerDownOutside={(e) => {
            if (blockSheetDismiss) e.preventDefault()
          }}
          onFocusOutside={(e) => {
            if (blockSheetDismiss) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (blockSheetDismiss) e.preventDefault()
          }}
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
            <SheetTitle className="text-base">
              {t('roleTemplates.createRolesTitle', { name: template?.nombre ?? '' })}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {t('roleTemplates.basedRolesSubtitle')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-medium">{t('roleTemplates.basedRoles')}</p>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={
                createMut.isPending ||
                (isInternal && hasInternalChild) ||
                (!isInternal && availableDealers.length === 0)
              }
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-3.5" />
              {t('roleTemplates.createRoles')}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {query.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('roles.usersLoading')}</p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('roleTemplates.roleEmpty')}</p>
            ) : (
              <TooltipProvider delayDuration={300}>
                <ul className="space-y-2">
                  {roles.map((role) => {
                    const estadoLabel =
                      role.estado === 1
                        ? t('roleTemplates.setInactive')
                        : t('roleTemplates.setActive')
                    return (
                      <li
                        key={role.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium">{role.nombre}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {role.dealerNombre ? (
                              <span>{role.dealerNombre}</span>
                            ) : (
                              <span>ALL</span>
                            )}
                            <span>·</span>
                            <span>
                              {role.cantPerm} {t('roleTemplates.roleColPerms').toLowerCase()}
                            </span>
                            <Badge
                              variant={role.estado === 1 ? 'secondary' : 'outline'}
                              className="font-normal"
                            >
                              {role.estado === 1
                                ? t('roleTemplates.estado')
                                : t('roleTemplates.setInactive')}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 cursor-pointer"
                                disabled={estadoMut.isPending || deleteMut.isPending}
                                onClick={() =>
                                  setConfirm({
                                    role,
                                    action: role.estado === 1 ? 'inactivate' : 'activate',
                                  })
                                }
                              >
                                {role.estado === 1 ? (
                                  <UserX className="size-3.5" />
                                ) : (
                                  <Check className="size-3.5" />
                                )}
                                <span className="sr-only">{estadoLabel}</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{estadoLabel}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 cursor-pointer text-destructive hover:text-destructive"
                                disabled={estadoMut.isPending || deleteMut.isPending}
                                onClick={() => setConfirm({ role, action: 'delete' })}
                              >
                                <Trash2 className="size-3.5" />
                                <span className="sr-only">{t('roleTemplates.delete')}</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {t('roleTemplates.delete')}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </TooltipProvider>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className={
            isInternal
              ? 'sm:max-w-md'
              : 'flex max-h-[min(85vh,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md'
          }
        >
          <DialogHeader
            className={isInternal ? undefined : 'shrink-0 space-y-0 border-b border-border px-6 py-4 pr-12 text-left'}
          >
            <DialogTitle>
              {isInternal
                ? t('roleTemplates.createInternalConfirmTitle')
                : t('roleTemplates.selectDealers')}
            </DialogTitle>
          </DialogHeader>
          {isInternal ? (
            <p className="text-sm text-muted-foreground">
              {t('roleTemplates.createInternalConfirm', { name: template?.nombre ?? '' })}
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
              <p className="shrink-0 text-sm text-muted-foreground">
                {t('roleTemplates.selectDealersHint')}
              </p>
              {availableDealers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('roleTemplates.noDealersAvailable')}
                </p>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  <ul className="space-y-2">
                    {availableDealers.map((d) => {
                      const dealerId = Number(d.id)
                      const checked = selectedDealers.includes(dealerId)
                      return (
                        <li key={d.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`rt-dealer-${d.id}`}
                            checked={checked}
                            className="cursor-pointer"
                            onCheckedChange={(v) => {
                              setSelectedDealers((prev) =>
                                v === true
                                  ? [...prev, dealerId]
                                  : prev.filter((x) => x !== dealerId),
                              )
                            }}
                          />
                          <Label
                            htmlFor={`rt-dealer-${d.id}`}
                            className="cursor-pointer text-sm font-normal"
                          >
                            {d.label}
                          </Label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter
            className={
              isInternal
                ? 'gap-3'
                : 'shrink-0 gap-3 border-t border-border bg-background px-6 py-4 sm:justify-end'
            }
          >
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={createMut.isPending}
              onClick={() => setCreateOpen(false)}
            >
              <X className="mr-1.5 size-4" />
              {t('roleTemplates.cancel')}
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={
                createMut.isPending ||
                (isInternal ? hasInternalChild : selectedDealers.length === 0)
              }
              onClick={() => void (isInternal ? onCreateInternal() : onCreateExternal())}
            >
              {createMut.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <UserPlus className="mr-1.5 size-4" />
              )}
              {createMut.isPending ? t('roleTemplates.saving') : t('roleTemplates.createRoles')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirm != null}
        onOpenChange={(v) => {
          if (!v) setConfirm(null)
        }}
        tone={confirm?.action === 'delete' ? 'danger' : 'warning'}
        title={
          confirm?.action === 'delete'
            ? t('roleTemplates.roleDeleteConfirmTitle')
            : confirm?.action === 'activate'
              ? t('roles.activateConfirmTitle')
              : t('roles.inactivateConfirmTitle')
        }
        description={
          confirm
            ? t(
                confirm.action === 'delete'
                  ? 'roleTemplates.roleDeleteConfirmDesc'
                  : confirm.action === 'activate'
                    ? 'roles.activateConfirmDesc'
                    : 'roles.inactivateConfirmDesc',
                { name: confirm.role.nombre },
              )
            : ''
        }
        cancelLabel={t('roleTemplates.cancel')}
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
        confirmVariant={confirm?.action === 'delete' ? 'destructive' : 'default'}
        pending={deleteMut.isPending || estadoMut.isPending}
        onConfirm={() => void onConfirmAction()}
      />
    </>
  )
}
