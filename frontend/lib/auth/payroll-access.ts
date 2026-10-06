import type { SrsMeUser } from './types'
import {
  ROL_ACCION_INVOICES_MODULE_ACCESS,
  ROL_ACCION_PRODUCTION_REPORT,
  ROL_ACCION_TTK_PAYROLL,
} from './ttk-permissions'

/** Same rule as Legacy `show-payroll-dashboard-sso` (admin or System v2 role). */
export function canAccessPayrollDashboard(user: SrsMeUser | null | undefined): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return user.idRolSystemV2 != null && user.idRolSystemV2 > 0
}

/**
 * Business KPIs (`/reports/business-kpis`): ruta y menú. Admin General, Admin Company (me.php
 * isSystemAdmin), «Reports > Production Report» (47) o «Time Tracking > Payroll» (93). Adentro cada
 * tab pide lo suyo (plans/plan-payroll-spend, decisión C).
 */
export function canAccessBusinessKpis(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return hasPermission(ROL_ACCION_PRODUCTION_REPORT) || hasPermission(ROL_ACCION_TTK_PAYROLL)
}

/**
 * Production Report (47): `/reports/production-vs-goal` y las tabs Billing, Collections, Punch y
 * Production de Business KPIs.
 */
export function canAccessProductionReport(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return hasPermission(ROL_ACCION_PRODUCTION_REPORT)
}

/** Tab Payroll Spend: montos de payroll, mismo permiso que el Payroll Excel Report de legacy (93). */
export function canViewPayrollSpend(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return hasPermission(ROL_ACCION_TTK_PAYROLL)
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
