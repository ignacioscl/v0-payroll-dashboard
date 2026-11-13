'use client'

import * as React from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { RoleParentCombobox, type RoleParentOption } from '@/components/roles/role-parent-combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useSetParentBulk } from '@/hooks/use-role-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RoleListRow, SetParentBulkResult } from '@/lib/roles/roles-types'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'

export type SetParentRoleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Roles tildados en la tabla. */
  roles: RoleListRow[]
  onDone: () => void
}

/**
 * «Set parent role» a los roles tildados (mismo patrón que «Assign all services»).
 * Sin padre elegido = les saca el padre. Los que no cumplen la regla de un nivel se saltean y se listan.
 */
export function SetParentRoleDialog({ open, onOpenChange, roles, onDone }: SetParentRoleDialogProps) {
  const { t } = useTranslation()
  const mutation = useSetParentBulk()
  const [parent, setParent] = React.useState<RoleParentOption | null>(null)
  const [result, setResult] = React.useState<SetParentBulkResult | null>(null)
  const [appliedCount, setAppliedCount] = React.useState(0)

  React.useEffect(() => {
    if (open) {
      setParent(null)
      setResult(null)
    }
  }, [open])

  const onApply = async () => {
    if (roles.length === 0) return
    setAppliedCount(roles.length)
    try {
      const res = await mutation.mutateAsync({
        action: 'set_parent',
        ids_rol: roles.map((r) => r.id),
        id_rol_parent: parent?.id ?? null,
      })
      onDone()
      if (res.skipped.length === 0) {
        toast.success(t('roles.setParentSuccess', { n: res.updated }))
        onOpenChange(false)
        return
      }
      // Hubo salteados: el modal queda abierto con la lista y el motivo de cada uno.
      setResult(res)
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('roles.setParentRole')}</DialogTitle>
          <DialogDescription className="text-left">
            {/* Después de aplicar, la selección de la tabla se limpia: el número sale del resultado. */}
            {t('roles.setParentDesc', {
              n: result ? appliedCount : roles.length,
            })}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <p>{t('roles.setParentSuccess', { n: result.updated })}</p>
            <p className="font-medium">{t('roles.setParentSkipped', { n: result.skipped.length })}</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {result.skipped.map((s) => (
                <li key={s.id}>
                  <span className="font-medium">{s.nombre}</span>
                  <span className="text-muted-foreground"> — {s.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="set-parent-role">{t('roles.parentRole')}</Label>
            <RoleParentCombobox
              id="set-parent-role"
              value={parent}
              onChange={setParent}
              enabled={open}
              disabled={mutation.isPending}
            />
            <p className="text-xs text-muted-foreground">{t('roles.setParentNoneHint')}</p>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              <Check className="size-4" />
              {t('roles.setParentClose')}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <X className="size-4" />
                {t('roles.cancel')}
              </Button>
              <Button
                type="button"
                disabled={mutation.isPending || roles.length === 0}
                onClick={() => void onApply()}
              >
                {mutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {t('roles.setParentApply')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
