import type { SrsMeUser } from './types'

/** Same rule as Legacy `show-payroll-dashboard-sso` (admin or System v2 role). */
export function canAccessPayrollDashboard(user: SrsMeUser | null | undefined): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return user.idRolSystemV2 != null && user.idRolSystemV2 > 0
}
