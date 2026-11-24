import type { SrsMeUser } from './types'
import {
  ROL_ACCION_INVOICES_MODULE_ACCESS,
  ROL_ACCION_REPORT_BUSINESS_KPIS,
  ROL_ACCION_REPORT_INCOME_BY_DEALER,
  ROL_ACCION_REPORT_MONTHLY_CLOSING,
  ROL_ACCION_REPORT_OPEN_INVOICES,
  ROL_ACCION_REPORT_PRODUCTION_VS_GOAL,
  ROL_ACCION_REPORT_WINDOW_TINT_CLOSING,
} from './ttk-permissions'

/** Same rule as Legacy `show-payroll-dashboard-sso` (admin or System v2 role). */
export function canAccessPayrollDashboard(user: SrsMeUser | null | undefined): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return user.idRolSystemV2 != null && user.idRolSystemV2 > 0
}

/**
 * Cada reporte de Pro, su permiso (tema 10 de plans/plan-reunion-juan-18-11, migration 033). Admin General y Admin
 * Company (me.php isSystemAdmin) pasan siempre el permiso; el módulo de la empresa, no.
 */
function adminOr(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
  id: number,
): boolean {
  if (!user) return false
  if (user.isSystemAdmin) return true
  return hasPermission(id)
}

/**
 * Módulo «Closing reports» de la empresa (legacy dealer_edit > Modules & function access, prendido solo en Auto Wax):
 * abre Monthly Closing, Window Tint Closing y Open Invoices (D17). Viene de me.php como `hasWindowTintClosing`, el
 * nombre de la columna de cuando abría solo Window Tint Closing.
 */
export function companyHasClosingReports(user: SrsMeUser | null | undefined): boolean {
  return Boolean(user?.hasWindowTintClosing)
}

/** Business KPIs (`/reports/business-kpis`) y todas sus tabs: «Report Pro > Business KPIs» (148). */
export function canAccessBusinessKpis(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  return adminOr(user, hasPermission, ROL_ACCION_REPORT_BUSINESS_KPIS)
}

/** `/reports/production-vs-goal`: «Report Pro > Production vs Goal by Dealer» (149). */
export function canAccessProductionVsGoal(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  return adminOr(user, hasPermission, ROL_ACCION_REPORT_PRODUCTION_VS_GOAL)
}

/** `/reports/income-by-dealer`: «Report Pro > Income by Dealer» (150). */
export function canAccessIncomeByDealer(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  return adminOr(user, hasPermission, ROL_ACCION_REPORT_INCOME_BY_DEALER)
}

/** `/reports/monthly-closing`: «Report Pro > Monthly Closing» (151) y el módulo «Closing reports» de la empresa. */
export function canAccessMonthlyClosing(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  return companyHasClosingReports(user) && adminOr(user, hasPermission, ROL_ACCION_REPORT_MONTHLY_CLOSING)
}

/** `/reports/window-tint-closing`: «Report Pro > Window Tint Closing» (152) y el módulo «Closing reports». */
export function canAccessWindowTintClosing(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  return companyHasClosingReports(user) && adminOr(user, hasPermission, ROL_ACCION_REPORT_WINDOW_TINT_CLOSING)
}

/**
 * Reports › Open Invoices (`/reports/open-invoices` y sus fotos): «Report Pro > Open Invoices» (153) y el módulo
 * «Closing reports».
 */
export function canAccessOpenInvoices(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  return companyHasClosingReports(user) && adminOr(user, hasPermission, ROL_ACCION_REPORT_OPEN_INVOICES)
}

/**
 * Billing → Invoices tab (`/billing/invoices`).
 * Legacy: Admin General / Admin Company (isSystemAdmin) or ROL_ACCION Invoices module access (15).
 */
export function canAccessBillingInvoices(
  user: SrsMeUser | null | undefined,
  hasPermission: (id: number) => boolean,
): boolean {
  return adminOr(user, hasPermission, ROL_ACCION_INVOICES_MODULE_ACCESS)
}

/** @deprecated Prefer {@link canAccessBusinessKpis}. True only for Admin General (not Admin Company). */
export function isAdminGeneralUser(user: SrsMeUser | null | undefined): boolean {
  if (!user?.isSystemAdmin) return false
  return user.rolSystemV2Name === 'Admin General'
}
