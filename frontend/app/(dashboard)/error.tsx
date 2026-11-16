'use client'

import { RouteError } from '@/components/layout/route-error'

/**
 * Error de una pantalla del panel: la tarjeta va dentro del marco (menú y barra quedan, los dibuja el layout).
 * plans/plan-buenas-practicas-v0, 2.9; doc de Next 16.2 `03-file-conventions/error.md` (`unstable_retry`).
 */
export default function DashboardError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <RouteError retry={unstable_retry} />
}
