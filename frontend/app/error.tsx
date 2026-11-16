'use client'

import { RouteError } from '@/components/layout/route-error'

/**
 * Atrapa lo que tiran los layouts de abajo (un `error.tsx` no atrapa el `layout.tsx` de su mismo segmento): el
 * `UpstreamUnavailableError` del PHP caído o colgado al validar la sesión en el panel y en `/login`. Sale sin el menú
 * y «Try again» vuelve a correr el layout, sin pedir login (plans/plan-buenas-practicas-v0, 2.6.8 y 2.9).
 */
export default function AppError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <RouteError retry={unstable_retry} />
    </main>
  )
}
