'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import {
  canAccessBillingInvoices,
  canAccessBusinessKpis,
  canAccessMonthlyClosing,
  canAccessPayrollDashboard,
  canAccessProductionReport,
  canAccessWindowTintClosing,
} from '@/lib/auth/payroll-access'
import { canAccessDailyPunch, canAccessSystemConfig } from '@/lib/auth/ttk-permissions'
import { canManageRoleTemplates, canViewRoles } from '@/lib/auth/roles-permissions'
import { canAccessExpenses } from '@/lib/auth/expenses-permissions'
import { isCompanyModuleBlockedPath, isDevEnvironment, isProdAllowedPath } from '@/lib/navigation'
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
  const canAccessProductionGoal = canAccessProductionReport(user, hasPermission)
  const canAccessBilling = canAccessBillingInvoices(user, hasPermission)
  const canAccessRoles = canViewRoles(hasPermission, user?.isSystemAdmin)
  const canAccessRoleTemplates = canManageRoleTemplates(hasPermission, user?.isSystemAdmin)
  const canAccessSettings = canAccessSystemConfig(hasPermission, user?.isSystemAdmin)
  const canAccessExpensesModule = canAccessExpenses(
    hasPermission,
    user?.isSystemAdmin,
    user?.hasExpenses,
  )
  const canAccessClosing = canAccessMonthlyClosing(user, hasPermission)
  const canAccessTintClosing = canAccessWindowTintClosing(user, hasPermission)
  const companyHasExpenses = Boolean(user?.hasExpenses)
  const companyHasWindowTintClosing = Boolean(user?.hasWindowTintClosing)
  const hasAnyModule =
    canAccessTtk ||
    canAccessProdKpis ||
    canAccessBilling ||
    canAccessRoles ||
    canAccessRoleTemplates ||
    canAccessSettings ||
    canAccessExpensesModule ||
    canAccessClosing ||
    canAccessTintClosing
  const isExternal = Boolean(user?.isCompanyTypeCompany)
  const homeFallback = isExternal ? '/issues' : '/'

  useEffect(() => {
    if (loading || !canAccessDashboard || !hasAnyModule) return

    // Externals never land on Dashboard home (SSO / deep link / typed URL).
    if (isExternal && pathname === '/') {
      router.replace('/issues')
      return
    }

    // Company module checks count in dev too; the dev bypass is for permissions only.
    if (
      isDevEnvironment() &&
      isCompanyModuleBlockedPath(pathname, { companyHasExpenses, companyHasWindowTintClosing })
    ) {
      router.replace(homeFallback)
      return
    }

    if (isDevEnvironment()) return
    if (
      !isProdAllowedPath(
        pathname,
        canAccessProdKpis,
        canAccessBilling,
        isExternal,
        canAccessRoles,
        canAccessRoleTemplates,
        canAccessSettings,
        canAccessProductionGoal,
        canAccessExpensesModule,
        canAccessClosing,
        canAccessTintClosing,
      )
    ) {
      router.replace(homeFallback)
    }
  }, [
    pathname,
    loading,
    canAccessDashboard,
    hasAnyModule,
    canAccessProdKpis,
    canAccessProductionGoal,
    canAccessBilling,
    canAccessRoles,
    canAccessRoleTemplates,
    canAccessSettings,
    canAccessExpensesModule,
    canAccessClosing,
    canAccessTintClosing,
    companyHasExpenses,
    companyHasWindowTintClosing,
    isExternal,
    homeFallback,
    router,
  ])

  if (!loading && !canAccessDashboard) {
    return (
      <AccessDenied message={t('access.noDashboardAccess')} />
    )
  }

  if (!isDevEnvironment() && !loading && !hasAnyModule) {
    return <AccessDenied />
  }

  return children
}
