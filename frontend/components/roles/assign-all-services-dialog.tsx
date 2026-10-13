'use client'

import * as React from 'react'
import { Check, Loader2, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useAssignAllServices } from '@/hooks/use-role-services'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'

export type AssignAllServicesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Selected external roles only. */
  roleIds: number[]
  onDone: () => void
}

/** Legacy "Asign all services to checked roles": every service of the role, both flags, always applied to users. */
export function AssignAllServicesDialog({
  open,
  onOpenChange,
  roleIds,
  onDone,
}: AssignAllServicesDialogProps) {
  const { t } = useTranslation()
  const mutation = useAssignAllServices()
  const [create, setCreate] = React.useState(true)
  const [approve, setApprove] = React.useState(true)

  React.useEffect(() => {
    if (open) {
      setCreate(true)
      setApprove(true)
    }
  }, [open])

  const onApply = async () => {
    if (roleIds.length === 0) return
    try {
      await mutation.mutateAsync({ action: 'assign_all', ids_rol: roleIds, create, approve })
      toast.success(t('roles.assignAllSuccess'))
      onOpenChange(false)
      onDone()
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('roles.assignAllTitle')}</DialogTitle>
          <DialogDescription className="flex items-start gap-2 text-left">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>{t('roles.assignAllWarning')}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="assign-all-create"
              checked={create}
              onCheckedChange={(v) => setCreate(v === true)}
              className="cursor-pointer"
            />
            <Label htmlFor="assign-all-create" className="cursor-pointer font-normal">
              {t('roles.assignAllCreate')}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="assign-all-approve"
              checked={approve}
              onCheckedChange={(v) => setApprove(v === true)}
              className="cursor-pointer"
            />
            <Label htmlFor="assign-all-approve" className="cursor-pointer font-normal">
              {t('roles.assignAllApprove')}
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('roles.assignAllCount', { n: roleIds.length })}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            {t('roles.cancel')}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || roleIds.length === 0}
            onClick={() => void onApply()}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t('roles.assignAllApply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
