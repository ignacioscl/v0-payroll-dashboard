'use client'

import * as React from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useInvoiceEmailActiveQueue,
  type InvoiceEmailActiveQueueDraft,
} from '@/hooks/use-invoice-email-active-queue'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

export function useInvoiceEmailQueuePanelState(open: boolean) {
  const activeQueue = useInvoiceEmailActiveQueue(open)
  const hasActiveQueue = activeQueue.data != null
  const [queueName, setQueueName] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setQueueName('')
  }, [open])

  return {
    activeQueue,
    hasActiveQueue,
    queueName,
    setQueueName,
    draft: (activeQueue.data ?? null) as InvoiceEmailActiveQueueDraft | null,
    isLoading: activeQueue.isLoading,
  }
}

/** Active-queue badge + queue name when creating a new queue. */
export function InvoiceEmailQueueFields({
  open,
  queueName,
  onQueueNameChange,
  hasActiveQueue,
  activeQueueLabel,
  isLoading,
  disabled,
  showFileName,
  fileName,
  onFileNameChange,
  className,
}: {
  open: boolean
  queueName: string
  onQueueNameChange: (value: string) => void
  hasActiveQueue: boolean
  activeQueueLabel?: string
  isLoading?: boolean
  disabled?: boolean
  showFileName?: boolean
  fileName?: string
  onFileNameChange?: (value: string) => void
  className?: string
}) {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <div className={cn('space-y-3 border-t border-border/60 pt-4', className)}>
      <div
        className={cn(
          'rounded-md border px-3 py-2 text-xs',
          hasActiveQueue
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
            : 'border-border/70 bg-muted/30 text-muted-foreground',
        )}
      >
        {isLoading
          ? t('invoices.emailQueueLoading')
          : hasActiveQueue
            ? activeQueueLabel?.trim()
              ? t('invoices.emailQueueActiveNamed', { name: activeQueueLabel.trim() })
              : t('invoices.emailQueueActive')
            : t('invoices.emailQueueNone')}
      </div>

      {!hasActiveQueue && !isLoading ? (
        <div className="space-y-1.5">
          <Label htmlFor="inv-email-queue-name">{t('invoices.emailQueueName')}</Label>
          <Input
            id="inv-email-queue-name"
            value={queueName}
            onChange={(e) => onQueueNameChange(e.target.value)}
            placeholder={t('invoices.emailQueueNamePlaceholder')}
            disabled={disabled}
          />
          <p className="text-[11px] text-muted-foreground">{t('invoices.emailQueueNameHint')}</p>
        </div>
      ) : null}

      {showFileName && onFileNameChange ? (
        <div className="space-y-1.5">
          <Label htmlFor="inv-email-queue-file-name">{t('invoices.actionEmailFileName')}</Label>
          <Input
            id="inv-email-queue-file-name"
            value={fileName ?? ''}
            onChange={(e) => onFileNameChange(e.target.value)}
            placeholder={t('invoices.actionEmailFileNamePlaceholder')}
            disabled={disabled}
          />
          <p className="text-[11px] text-muted-foreground">{t('invoices.actionEmailFileNameHint')}</p>
        </div>
      ) : null}
    </div>
  )
}
