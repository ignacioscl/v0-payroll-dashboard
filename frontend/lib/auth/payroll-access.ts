import type { SrsMeUser } from './types'
import {
  ROL_ACCION_INVOICES_MODULE_ACCESS,
  ROL_ACCION_PRODUCTION_REPORT,
} from './ttk-permissions'

/** Same rule as Legacy `show-payroll-dashboard-sso` (admin or System v2 role). */
export function canAccessPayrollDashboard(user: SrsMeUser | null | undefined): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return user.idRolSystemV2 != null && user.idRolSystemV2 > 0
}

/**
 * Production Business KPIs (`/reports/business-kpis`).
 * Legacy: Admin General, Admin Company (me.php isSystemAdmin), or ROL_ACCION production report (47).
 */
export function canAccessBusinessKpis(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return hasPermission(ROL_ACCION_PRODUCTION_REPORT)
}

/**
 * Billing → Invoices tab (`/billing/invoices`).
 * Legacy: Admin General / Admin Company (isSystemAdmin) or ROL_ACCION Invoices module access (15).
 */
export function canAccessBillingInvoices(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return hasPermission(ROL_ACCION_INVOICES_MODULE_ACCESS)
}

/** @deprecated Prefer {@link canAccessBusinessKpis}. True only for Admin General (not Admin Company). */
export function isAdminGeneralUser(user: SrsMeUser | null | undefined): boolean {
  if (!user?.isSystemAdmin) return false
  return user.rolSystemV2Name === 'Admin General'
}
