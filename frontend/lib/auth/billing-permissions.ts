/** Legacy ROL_ACCION ids — billing invoice row actions. */
export const ROL_ACCION_INVOICE_REMOVE_WO = 17
export const ROL_ACCION_INVOICE_DELETE = 18
export const ROL_ACCION_INVOICE_PRINT = 19
export const ROL_ACCION_INVOICE_SEND_EMAIL = 20
export const ROL_ACCION_INVOICE_EDIT_PO_RO = 64
/** District filter on invoice list (legacy districtManager). */
export const ROL_ACCION_BILLING_DISTRICT = 69

export function canDeleteInvoice(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_INVOICE_DELETE)
}

export function canFilterInvoiceDistrict(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_BILLING_DISTRICT)
}

export function canRemoveWoFromInvoice(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_INVOICE_REMOVE_WO)
}

export function canEditInvoicePoRo(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_INVOICE_EDIT_PO_RO)
}

export function canPrintInvoice(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_INVOICE_PRINT)
}

export function canSendInvoiceEmail(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_INVOICE_SEND_EMAIL)
}
