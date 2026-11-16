'use client'

import { usePathname } from 'next/navigation'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { getScreenAccess, isDevEnvironment } from '@/lib/navigation'
import { useTranslation } from '@/lib/i18n/locale-context'
import { AccessDenied } from './access-denied'
import { ContentSkeleton } from './content-skeleton'

/**
 * Permiso de cada pantalla, dentro del marco (plans/plan-buenas-practicas-v0, 4.6). Se vuelve a evaluar en cada cambio
 * de dirección (el layout no se re-ejecuta al navegar). Sin `useEffect` ni `router.replace`: mientras `/me` no está,
 * esqueleto (en la primera carga llega del servidor, 4.5); con `/me`, la pantalla o «Access denied» con el menú y la
 * dirección igual (D11). La decisión es de `getScreenAccess`.
 */
export function ProdRouteGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { user, permissionIds, loading } = useSrsMe()

  if (loading) return <ContentSkeleton />

  switch (getScreenAccess(pathname, { user, permissionIds }, { isDev: isDevEnvironment() })) {
    case 'allowed':
      return children
    case 'no-dashboard':
      return <AccessDenied message={t('access.noDashboardAccess')} />
    case 'no-modules':
      return <AccessDenied />
    default:
      return <AccessDenied message={t('access.noScreenAccess')} />
  }
}
