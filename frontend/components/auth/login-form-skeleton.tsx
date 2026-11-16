'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/lib/i18n/locale-context'

/**
 * Lo que se ve si el `Suspense` de `/login` llega a mostrarse (plans/plan-buenas-practicas-v0, 4.2): la caja del
 * formulario de `login-form.tsx` (`w-full max-w-[420px]`, título, dos campos y el botón), solo con `Skeleton`.
 */
export function LoginFormSkeleton() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <div role="status" aria-live="polite" data-testid="login-form-skeleton" className="w-full max-w-[420px]">
        <span className="sr-only">{t('common.loading')}</span>
        <div className="mb-8 flex flex-col gap-2">
          <Skeleton className="h-8 w-48 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="space-y-5">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  )
}
