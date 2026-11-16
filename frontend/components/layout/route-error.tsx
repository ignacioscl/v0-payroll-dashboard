'use client'

import { AlertTriangle, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/locale-context'
import { PageState } from './page-state'

/**
 * La tarjeta de error de `app/error.tsx` y `app/(dashboard)/error.tsx`. Nunca muestra el mensaje ni el `digest` del
 * error (textos de D1). «Try again» llama `unstable_retry` (Next 16.2: vuelve a pedir la pantalla).
 */
export function RouteError({ retry }: { retry: () => void }) {
  const { t } = useTranslation()
  return (
    <PageState
      icon={AlertTriangle}
      title={t('routeError.title')}
      message={t('routeError.body')}
      action={
        <Button type="button" variant="outline" onClick={() => retry()}>
          <RotateCw aria-hidden />
          {t('authError.tryAgain')}
        </Button>
      }
    />
  )
}
