'use client'

import { cn } from '@/lib/utils'
import {
  PUNCH_METHOD_LABELS,
  type PunchEventMethod,
} from '@/lib/ttk/punch-method'

export function PunchTimeCell({
  time,
  method,
  className,
}: {
  time: string
  method: PunchEventMethod
  className?: string
}) {
  if (!time) return <span className={className}>—</span>

  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1 font-mono text-xs', className)}>
      <span>{time}</span>
      {method ? (
        <span className="font-sans text-[10px] font-medium text-muted-foreground">
          ({PUNCH_METHOD_LABELS[method]})
        </span>
      ) : null}
    </span>
  )
}
