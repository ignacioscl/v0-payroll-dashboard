'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAccessPayrollDashboard } from '@/lib/auth/payroll-access'
import { canAccessDailyPunch } from '@/lib/auth/ttk-permissions'
import { isDevEnvironment, isProdAllowedPath } from '@/lib/navigation'
import { AccessDenied } from './access-denied'

export function ProdRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, hasPermission } = useSrsMe()

  const canAccessDashboard = canAccessPayrollDashboard(user)
  const canAccessTtk = canAccessDailyPunch(hasPermission, user?.isSystemAdmin)

  useEffect(() => {
    if (loading || !canAccessDashboard || !canAccessTtk) return
    if (isDevEnvironment()) return
    if (!isProdAllowedPath(pathname)) {
      router.replace('/')
    }
  }, [pathname, loading, canAccessDashboard, canAccessTtk, router])

  if (!loading && !canAccessDashboard) {
    return (
      <AccessDenied message="You do not have access to the payroll dashboard. Contact your administrator if you believe this is an error." />
    )
  }

  if (!isDevEnvironment() && !loading && !canAccessTtk) {
    return <AccessDenied />
  }

  return children
}
