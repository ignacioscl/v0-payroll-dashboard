import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Estado de una pantalla dentro del marco: icono en un cuadrado redondeado, título, una línea y un botón opcional.
 * Lo usan «Access denied», las tarjetas de error (`app/error.tsx`, `app/(dashboard)/error.tsx`) y `not-found.tsx`
 * (plans/plan-buenas-practicas-v0, 2.9). `app/global-error.tsx` repite este marcado sin usarlo (no tiene providers):
 * si cambia acá, cambia allá.
 */
export function PageState({
  icon: Icon,
  title,
  message,
  action,
  tone = 'destructive',
}: {
  icon: LucideIcon
  title: string
  message: string
  action?: ReactNode
  tone?: 'destructive' | 'muted'
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ring-1',
          tone === 'destructive'
            ? 'bg-destructive/10 text-destructive ring-destructive/20'
            : 'bg-muted text-muted-foreground ring-border',
        )}
      >
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
