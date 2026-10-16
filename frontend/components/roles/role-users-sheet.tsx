'use client'

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useRemoveUserFromRole, useRoleUsers } from '@/hooks/use-role-lookups'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { RoleListRow, RoleUserRow } from '@/lib/roles/roles-types'

export type RoleUsersSheetProps = {
  role: RoleListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleUsersSheet({ role, open, onOpenChange }: RoleUsersSheetProps) {
  const { t } = useTranslation()
  const query = useRoleUsers(role?.id ?? null, open)
  const removeUser = useRemoveUserFromRole()
  const [confirm, setConfirm] = React.useState<RoleUserRow | null>(null)
  const canRemove = query.data?.canRemove ?? false

  const runRemove = async () => {
    if (!confirm || !role) return
    try {
      await removeUser.mutateAsync({
        id_rol: role.id,
        id_usuario: confirm.id,
        id_dealer_asigned: confirm.idDealerAsigned,
      })
      setConfirm(null)
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-4 pr-12 text-left">
          <SheetTitle className="text-base">
            {t('roles.usersTitle', { name: role?.nombre ?? '' })}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {t('roles.usersSubtitle')}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-4">
          {query.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('roles.usersLoading')}
            </p>
          ) : query.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : t('roles.usersError')}
            </p>
          ) : (query.data?.users.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('roles.usersEmpty')}
            </p>
          ) : (
            <TooltipProvider delayDuration={300}>
              <ul className="space-y-2 py-4">
                {/* Una fila por asignación: el mismo usuario sale una vez por dealer. */}
                {query.data!.users.map((u) => (
                  <li
                    key={`${u.id}-${u.idDealerAsigned ?? 'rol'}`}
                    className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-medium">{u.nombre}</div>
                      <div className="break-words text-xs text-muted-foreground">
                        {[u.email, u.codigoInterno].filter(Boolean).join(' · ')}
                      </div>
                      {u.dealer ? (
                        <div className="break-words text-xs text-muted-foreground">
                          {t('roles.usersDealer', { dealer: u.dealer })}
                        </div>
                      ) : null}
                    </div>
                    {u.isProRole ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="shrink-0 cursor-pointer">
                            {t('roles.usersProRole')}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[16rem]">
                          {t('roles.usersProRoleHint')}
                        </TooltipContent>
                      </Tooltip>
                    ) : canRemove ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="size-7 shrink-0 cursor-pointer text-destructive hover:text-destructive"
                            onClick={() => setConfirm(u)}
                          >
                            <Trash2 className="size-3.5" />
                            <span className="sr-only">{t('roles.usersRemove')}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">{t('roles.usersRemove')}</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </li>
                ))}
              </ul>
            </TooltipProvider>
          )}
        </ScrollArea>
      </SheetContent>

      <ConfirmActionDialog
        open={confirm != null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null)
        }}
        tone="danger"
        title={t('roles.usersRemoveConfirmTitle')}
        description={
          confirm
            ? t('roles.usersRemoveConfirmDesc', {
                role: role?.nombre ?? '',
                user: confirm.nombre,
                dealer: confirm.dealer,
              })
            : ''
        }
        confirmLabel={t('roles.usersRemoveConfirm')}
        confirmIcon={Trash2}
        cancelLabel={t('roles.cancel')}
        confirmVariant="destructive"
        pending={removeUser.isPending}
        onConfirm={runRemove}
      />
    </Sheet>
  )
}
