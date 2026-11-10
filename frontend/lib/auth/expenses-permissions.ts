/** Legacy ROL_ACCION ids — Expenses (names as in ROL_ACCION.nombre_accion). */

/** `Expenses > Allow adding expenses` */
export const ROL_ACCION_EXPENSES_ADD = 110
/** `Expenses > Expense approval or reject permission` — also opens the Expenses menu (as legacy). */
export const ROL_ACCION_EXPENSES_APPROVE = 111
/** `Expenses > Add an expense on behalf of another employee` */
export const ROL_ACCION_EXPENSES_ON_BEHALF = 117
/** `Expenses > Allow edit expense` — edit, delete and restore. */
export const ROL_ACCION_EXPENSES_EDIT = 118

type HasPermission = (id: number) => boolean

/**
 * Expenses menu and its four screens: the company needs the «Expenses» check (legacy dealer_edit >
 * Modules & function access, `me.hasExpenses`), then 111 or Admin General/Company (legacy
 * navigation_panel.html). Without the check nobody sees it, whatever the permissions.
 */
export function canAccessExpenses(
  hasPermission: HasPermission,
  isSystemAdmin: boolean | undefined,
  companyHasExpenses: boolean | undefined,
): boolean {
  if (!companyHasExpenses) return false
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_EXPENSES_APPROVE)
}

/** «Add Expense» (110). */
export function canAddExpenses(hasPermission: HasPermission, isSystemAdmin?: boolean): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_EXPENSES_ADD)
}

/** Approve / Reject (111). */
export function canApproveExpenses(hasPermission: HasPermission, isSystemAdmin?: boolean): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_EXPENSES_APPROVE)
}

/** Edit, Delete and Restore (118). */
export function canEditExpenses(hasPermission: HasPermission, isSystemAdmin?: boolean): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_EXPENSES_EDIT)
}

/** «Assign to employee» combo (117). */
export function canAssignExpenseToEmployee(
  hasPermission: HasPermission,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_EXPENSES_ON_BEHALF)
}
