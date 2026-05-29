'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAccessDailyPunch } from '@/lib/auth/ttk-permissions'
import { isDevEnvironment, isProdAllowedPath } from '@/lib/navigation'
import { AccessDenied } from './access-denied'

export function ProdRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, hasPermission } = useSrsMe()

  const canAccessTtk = canAccessDailyPunch(hasPermission, user?.isSystemAdmin)

  useEffect(() => {
    if (isDevEnvironment() || loading || !canAccessTtk) return
    if (!isProdAllowedPath(pathname)) {
      router.replace('/')
    }
  }, [pathname, loading, canAccessTtk, router])

  if (!isDevEnvironment() && !loading && !canAccessTtk) {
    return <AccessDenied />
  }

  return children
}
