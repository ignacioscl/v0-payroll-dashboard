'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ConfirmActionTone = 'danger' | 'warning' | 'success' | 'info'

const TONE_CONFIG: Record<
  ConfirmActionTone,
  {
    icon: LucideIcon
    iconWrap: string
    iconColor: string
  }
> = {
  danger: {
    icon: AlertTriangle,
    iconWrap: 'bg-destructive/10 ring-destructive/20',
    iconColor: 'text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    iconWrap: 'bg-amber-500/15 ring-amber-500/25',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  success: {
    icon: CheckCircle2,
    iconWrap: 'bg-emerald-500/15 ring-emerald-500/25',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  info: {
    icon: Info,
    iconWrap: 'bg-accent/15 ring-accent/25',
    iconColor: 'text-accent dark:text-accent',
  },
}

export type ConfirmActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tone?: ConfirmActionTone
  /** Override default tone icon */
  icon?: LucideIcon
  title: string
  description: React.ReactNode
  cancelLabel?: string
  confirmLabel: string
  confirmIcon?: LucideIcon
  cancelIcon?: LucideIcon
  onConfirm: () => void | Promise<void>
  pending?: boolean
  pendingLabel?: string
  confirmVariant?: 'default' | 'destructive' | 'secondary'
  confirmClassName?: string
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  tone = 'warning',
  icon: IconOverride,
  title,
  description,
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmIcon: ConfirmIcon,
  cancelIcon: CancelIcon = X,
  onConfirm,
  pending = false,
  pendingLabel = 'Processing…',
  confirmVariant,
  confirmClassName,
}: ConfirmActionDialogProps) {
  const toneCfg = TONE_CONFIG[tone]
  const Icon = IconOverride ?? toneCfg.icon
  const resolvedConfirmVariant =
    confirmVariant ?? (tone === 'danger' || tone === 'warning' ? 'destructive' : 'default')

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault()
    void onConfirm()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="flex flex-col items-center px-6 pt-8 pb-2 text-center">
          <div
            className={cn(
              'mb-5 flex size-16 items-center justify-center rounded-full ring-8',
              toneCfg.iconWrap,
            )}
            aria-hidden
          >
            <Icon className={cn('size-8', toneCfg.iconColor)} strokeWidth={1.75} />
          </div>
          <AlertDialogTitle className="text-center text-lg font-semibold tracking-tight">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
          <AlertDialogCancel asChild disabled={pending}>
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              <CancelIcon className="size-4" />
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <Button
            type="button"
            variant={resolvedConfirmVariant}
            className={cn('w-full sm:w-auto', confirmClassName)}
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : ConfirmIcon ? (
              <ConfirmIcon className="size-4" />
            ) : null}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
