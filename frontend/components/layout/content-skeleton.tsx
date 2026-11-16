'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/lib/i18n/locale-context'

/**
 * Esqueleto del contenido mientras llega la pantalla (plans/plan-buenas-practicas-v0, 4.1; regla global «Cambiar de
 * pantalla es instantáneo»): el menú y la barra quedan, el contenido pasa a esto en el acto. Solo con la primitiva
 * `Skeleton` y las medidas de lo que ya existe: el encabezado de `PageHeading`, la grilla de tarjetas del Dashboard y
 * una tabla. Sin anchos fijos (anda a 375 px). Sin texto visible: «Loading…» solo para el lector de pantalla.
 */
export function ContentSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" data-testid="content-skeleton" className="flex w-full max-w-full flex-col gap-6">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <Skeleton className="h-7 w-48 max-w-full sm:h-9 sm:w-64" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
      <div className="w-full max-w-full overflow-hidden rounded-xl border bg-card">
        <Skeleton className="h-11 w-full rounded-none" />
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
