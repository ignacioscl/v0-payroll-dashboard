'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRoleAction } from '@/hooks/use-role-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { RoleListRow } from '@/lib/roles/roles-types'

export type AccessLevelDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: RoleListRow | null
}

export function AccessLevelDialog({ open, onOpenChange, role }: AccessLevelDialogProps) {
  const { t } = useTranslation()
  const action = useRoleAction()
  const [value, setValue] = React.useState('')

  React.useEffect(() => {
    if (open && role) {
      setValue(role.ponderacion != null ? String(role.ponderacion) : '')
    }
  }, [open, role])

  const onSave = async () => {
    if (!role) return
    const pond = Number(value)
    if (!Number.isFinite(pond) || pond < 1) {
      toast.error(t('roles.accessLevelInvalid'))
      return
    }
    try {
      await action.mutateAsync({
        id_rol: role.id,
        action: 'access_level',
        ponderation: pond,
      })
      toast.success(t('roles.accessLevelSaved'))
      onOpenChange(false)
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('roles.accessLevelTitle', { name: role?.nombre ?? '' })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pond">{t('roles.accessLevel')}</Label>
          <Input
            id="pond"
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSave()
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('roles.cancel')}
          </Button>
          <Button type="button" disabled={action.isPending} onClick={() => void onSave()}>
            {t('roles.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
