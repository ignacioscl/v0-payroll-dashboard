import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * El estado de una tabla sin filas (sin dealer, sin fechas, error, vacía): ícono, título y ayuda. Lo usan Invoices y
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T9); antes era una función local de `invoice-list-table.tsx`.
 */
export function StateBlock({
  icon,
  title,
  hint,
  tone = 'muted',
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  tone?: 'muted' | 'danger'
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl',
          tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{title}</p>
        {hint ? <p className="max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}
