'use client'

import { RotateCcw, Trash2 } from 'lucide-react'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { useTranslation } from '@/lib/i18n/locale-context'

export type PunchDeleteConfirmTarget = {
  id: number | string
  employeeName: string
  punchDateLabel: string
  action: 'delete' | 'activate'
}

type PunchDeleteConfirmDialogProps = {
  target: PunchDeleteConfirmTarget | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  pending?: boolean
}

export function PunchDeleteConfirmDialog({
  target,
  onOpenChange,
  onConfirm,
  pending = false,
}: PunchDeleteConfirmDialogProps) {
  const { t } = useTranslation()
  const employee = target?.employeeName?.trim() || t('punch.thisEmployee')
  const dateLabel = target?.punchDateLabel?.trim() || t('punch.selectedDate')
  const isDelete = target?.action === 'delete'

  return (
    <ConfirmActionDialog
      open={target !== null}
      onOpenChange={onOpenChange}
      tone={isDelete ? 'warning' : 'success'}
      title={isDelete ? t('punch.deleteConfirmTitle') : t('punch.restoreConfirmTitle')}
      description={
        isDelete
          ? t('punch.deleteConfirmBody', { employee, date: dateLabel })
          : t('punch.restoreConfirmBody', { employee, date: dateLabel })
      }
      cancelLabel={t('common.cancel')}
      confirmLabel={isDelete ? t('punch.deleteAction') : t('punch.restoreAction')}
      confirmIcon={isDelete ? Trash2 : RotateCcw}
      confirmVariant={isDelete ? 'destructive' : 'default'}
      confirmClassName={
        isDelete
          ? undefined
          : 'bg-emerald-600 text-white hover:bg-emerald-600/90 focus-visible:ring-emerald-600/30'
      }
      onConfirm={onConfirm}
      pending={pending}
      pendingLabel={isDelete ? t('common.deleting') : t('common.restoring')}
    />
  )
}
