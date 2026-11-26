/** Legacy ROL_ACCION ids (ttk_main / rolMaganer.userHavePermission). */
/** Invoices module access (legacy billing "Invoice" tab). */
export const ROL_ACCION_INVOICES_MODULE_ACCESS = 15

/** Legacy ROL_ACCION: Invoices > Create Invoice (WO to be Billed: generar, y entrar a la pantalla). */
export const ROL_ACCION_INVOICE_CREATE = 16
/*
 * Un permiso por reporte de Pro (migration 033, tema 10 de plans/plan-reunion-juan-18-11). Sin roles al salir: los admins
 * pasan siempre. Los del legacy que abrían estos reportes (47, 93, 123 y 140) gobiernan solo el legacy. Mismos números
 * en BE/srs/auth/srs-permission.repository.ts.
 */
/** Report Pro > Business KPIs: la pantalla y todas sus tabs (también Payroll Spend). */
export const ROL_ACCION_REPORT_BUSINESS_KPIS = 148
/** Report Pro > Production vs Goal by Dealer. */
export const ROL_ACCION_REPORT_PRODUCTION_VS_GOAL = 149
/** Report Pro > Income by Dealer. */
export const ROL_ACCION_REPORT_INCOME_BY_DEALER = 150
/** Report Pro > Monthly Closing (con el módulo «Closing reports» de la empresa). */
export const ROL_ACCION_REPORT_MONTHLY_CLOSING = 151
/** Report Pro > Window Tint Closing (con el módulo «Closing reports» de la empresa). */
export const ROL_ACCION_REPORT_WINDOW_TINT_CLOSING = 152
/** Report Pro > Open Invoices y sus fotos (con el módulo «Closing reports» de la empresa). */
export const ROL_ACCION_REPORT_OPEN_INVOICES = 153
/** Same gate as legacy Time Tracking menu (show-rol-action-65 / Daily Punch). */
export const ROL_ACCION_TTK_ADMIN_HOURS = 65
export const ROL_ACCION_ADD_EDIT_PUNCH = 67
export const ROL_ACCION_DELETE_PUNCH = 68
export const ROL_ACCION_EDIT_PAYMENT_TYPE = 105
export const ROL_ACCION_VIEW_PAYMENT_TYPE = 130
export const ROL_ACCION_EDIT_PAYMENT_TYPE_ALT = 136
export const ROL_ACCION_SYSTEM_CONFIG = 141
/** Time Tracking > View Fake GPS (migration 004). */
export const ROL_ACCION_VIEW_FAKE_GPS = 146

export function canAccessDailyPunch(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_TTK_ADMIN_HOURS)
}

export function canAddOrEditPunch(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_ADD_EDIT_PUNCH)
}

export function canDeletePunch(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_DELETE_PUNCH)
}

/** Edit payment type button (legacy 105 or 136). */
export function canEditPaymentType(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return (
    Boolean(isSystemAdmin) ||
    hasPermission(ROL_ACCION_EDIT_PAYMENT_TYPE) ||
    hasPermission(ROL_ACCION_EDIT_PAYMENT_TYPE_ALT)
  )
}

/** View payment type column (legacy 130 read-only, or edit perms). */
export function canViewPaymentType(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return (
    canEditPaymentType(hasPermission, isSystemAdmin) ||
    hasPermission(ROL_ACCION_VIEW_PAYMENT_TYPE)
  )
}

/**
 * View payment amounts (hourly rate, payment type price) — legacy 105 only.
 *
 * 130 (View Payment type) and 136 (Edit Payroll Type) can see the payment type
 * name but NOT the values: 136 is defined as "Permite editar tipo de pagos de
 * ponchadas. Sin permitir ver valores".
 */
export function canViewPaymentAmount(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_EDIT_PAYMENT_TYPE)
}

/** Fake GPS card: Admin General / Admin Company (isSystemAdmin) or 146. */
export function canViewFakeGps(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_VIEW_FAKE_GPS)
}

export function canAccessSystemConfig(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_SYSTEM_CONFIG)
}
