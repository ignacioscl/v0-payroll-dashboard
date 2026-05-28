'use client'

import { RotateCcw, Trash2 } from 'lucide-react'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'

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
  const employee = target?.employeeName?.trim() || 'this employee'
  const dateLabel = target?.punchDateLabel?.trim() || 'the selected date'
  const isDelete = target?.action === 'delete'

  return (
    <ConfirmActionDialog
      open={target !== null}
      onOpenChange={onOpenChange}
      tone={isDelete ? 'warning' : 'success'}
      title={isDelete ? 'Delete punch?' : 'Restore punch?'}
      description={
        isDelete ? (
          <>
            The punch for{' '}
            <span className="font-semibold text-foreground">{employee}</span> on{' '}
            <span className="font-semibold text-foreground">{dateLabel}</span> will be
            deleted.
          </>
        ) : (
          <>
            The punch for{' '}
            <span className="font-semibold text-foreground">{employee}</span> on{' '}
            <span className="font-semibold text-foreground">{dateLabel}</span> will be
            restored and shown again in the list.
          </>
        )
      }
      cancelLabel="Cancel"
      confirmLabel={isDelete ? 'Delete punch' : 'Restore punch'}
      confirmIcon={isDelete ? Trash2 : RotateCcw}
      confirmVariant={isDelete ? 'destructive' : 'default'}
      confirmClassName={
        isDelete
          ? undefined
          : 'bg-emerald-600 text-white hover:bg-emerald-600/90 focus-visible:ring-emerald-600/30'
      }
      onConfirm={onConfirm}
      pending={pending}
      pendingLabel={isDelete ? 'Deleting…' : 'Restoring…'}
    />
  )
}
