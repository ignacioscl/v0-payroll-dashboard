'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Plus, Trash2, UserX } from 'lucide-react'

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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  const [confirmDelete, setConfirmDelete] = React.useState<RoleTemplateChildRole | null>(null)

  React.useEffect(() => {
    if (!open) {
      setCreateOpen(false)
      setSelectedDealers([])
      setConfirmDelete(null)
    }
  }, [open])

  const roles = query.data?.results ?? []
  const usedDealerIds = new Set(
    roles.map((r) => r.idDealer).filter((n): n is number => n != null && n > 0),
  )
  const availableDealers = dealers.filter((d) => !usedDealerIds.has(Number(d.id)))

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

  const onToggleEstado = async (role: RoleTemplateChildRole) => {
    if (!id) return
    const next: 0 | 1 = role.estado === 1 ? 0 : 1
    try {
      await estadoMut.mutateAsync({ id, idRol: role.id, estado: next })
      toast.success(
        next === 1 ? t('roles.activateSuccess') : t('roles.inactivateSuccess'),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('roleTemplates.roleEstadoError'))
    }
  }

  const onConfirmDelete = async () => {
    if (!id || !confirmDelete) return
    try {
      await deleteMut.mutateAsync({ id, idRol: confirmDelete.id })
      toast.success(t('roleTemplates.roleDeleteSuccess'))
      setConfirmDelete(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('roleTemplates.roleDeleteError'))
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

          <ScrollArea className="min-h-0 flex-1 px-4 py-3">
            {query.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('roles.usersLoading')}</p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('roleTemplates.roleEmpty')}</p>
            ) : (
              <ul className="space-y-2">
                {roles.map((role) => (
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
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={estadoMut.isPending}
                        onClick={() => void onToggleEstado(role)}
                      >
                        {role.estado === 1 ? (
                          <UserX className="size-3.5" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        disabled={deleteMut.isPending}
                        onClick={() => setConfirmDelete(role)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
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
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('roleTemplates.selectDealersHint')}
              </p>
              {availableDealers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('roleTemplates.noDealersAvailable')}
                </p>
              ) : (
                <ScrollArea className="max-h-64">
                  <ul className="space-y-2 pr-2">
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
                </ScrollArea>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t('roleTemplates.cancel')}
            </Button>
            <Button
              type="button"
              disabled={
                createMut.isPending ||
                (isInternal ? hasInternalChild : selectedDealers.length === 0)
              }
              onClick={() => void (isInternal ? onCreateInternal() : onCreateExternal())}
            >
              {createMut.isPending ? t('roleTemplates.saving') : t('roleTemplates.createRoles')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmDelete != null}
        onOpenChange={(v) => {
          if (!v) setConfirmDelete(null)
        }}
        tone="danger"
        title={t('roleTemplates.roleDeleteConfirmTitle')}
        description={t('roleTemplates.roleDeleteConfirmDesc', {
          name: confirmDelete?.nombre ?? '',
        })}
        confirmLabel={t('roleTemplates.delete')}
        confirmIcon={Trash2}
        confirmVariant="destructive"
        pending={deleteMut.isPending}
        onConfirm={() => void onConfirmDelete()}
      />
    </>
  )
}
