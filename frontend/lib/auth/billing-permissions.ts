/** Legacy ROL_ACCION ids — billing invoice row actions. */
export const ROL_ACCION_INVOICE_DELETE = 18
export const ROL_ACCION_INVOICE_PRINT = 19
export const ROL_ACCION_INVOICE_SEND_EMAIL = 20

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
