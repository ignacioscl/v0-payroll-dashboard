'use client'

import { DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaymentTypeCellProps {
  name?: string | null
  editable?: boolean
  onEdit?: () => void
}

export function PaymentTypeCell({ name, editable = false, onEdit }: PaymentTypeCellProps) {
  const hasType = Boolean(name && name.trim())

  const chipClass = cn(
    'inline-flex h-5 max-w-[130px] items-center gap-1 rounded border px-1.5',
    'text-[10px] font-medium leading-none',
    hasType
      ? 'border-primary/40 bg-primary/15 text-primary'
      : 'border-destructive/40 bg-destructive/15 text-destructive',
  )

  if (!editable) {
    return (
      <span className={cn(chipClass, 'cursor-default')}>
        {hasType ? (
          <>
            <DollarSign className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      title="Edit payment type"
      className={cn(
        chipClass,
        'cursor-pointer transition-colors',
        hasType ? 'hover:bg-primary/25' : 'hover:bg-destructive/25',
      )}
    >
      <DollarSign className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{hasType ? name : 'Set payment'}</span>
    </button>
  )
}
