'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAccessBusinessKpis, canAccessPayrollDashboard } from '@/lib/auth/payroll-access'
import { canAccessDailyPunch } from '@/lib/auth/ttk-permissions'
import { isDevEnvironment, isProdAllowedPath } from '@/lib/navigation'
import { AccessDenied } from './access-denied'
import { useTranslation } from '@/lib/i18n/locale-context'

export function ProdRouteGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, hasPermission } = useSrsMe()

  const canAccessDashboard = canAccessPayrollDashboard(user)
  const canAccessTtk = canAccessDailyPunch(hasPermission, user?.isSystemAdmin)
  const canAccessProdKpis = canAccessBusinessKpis(user, hasPermission)

  useEffect(() => {
    if (loading || !canAccessDashboard || !canAccessTtk) return
    if (isDevEnvironment()) return
    if (!isProdAllowedPath(pathname, canAccessProdKpis)) {
      router.replace('/')
    }
  }, [pathname, loading, canAccessDashboard, canAccessTtk, canAccessProdKpis, router])

  if (!loading && !canAccessDashboard) {
    return (
      <AccessDenied message={t('access.noDashboardAccess')} />
    )
  }

  if (!isDevEnvironment() && !loading && !canAccessTtk) {
    return <AccessDenied />
  }

  return children
}
