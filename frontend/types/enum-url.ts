/** BFF routes served by this Next app (not SRS upstream). */
export enum UrlEnum {
  AUTH_SESSION = '/api/auth/session',
  AUTH_ME = '/api/auth/me',
  DEALERS = '/api/dealers',
}

/**
 * Relative paths on the SRS PHP server.
 * All are proxied client-side via `/api/srs/[...path]` (see `srsProxyUrl`).
 */
export const SrsPhpPath = {
  TTK_LIST: 'php/api/payroll/ttk-list.php',
  TTK_ISSUE_COUNTS: 'php/api/payroll/ttk-issue-counts.php',
  TTK_DASHBOARD_SUMMARY: 'php/api/payroll/ttk-dashboard-summary.php',
  TTK_TODAY_STATUS: 'php/api/payroll/ttk-today-status.php',
  TTK_EDIT: 'php/api/payroll/ttk-edit.php',
  TTK_ADD: 'php/api/payroll/ttk-add.php',
  TTK_DELETE: 'php/api/payroll/ttk-delete.php',
  TTK_EMPLOYEES: 'php/api/payroll/ttk-employees.php',
  TTK_GET_BY_ID: 'php/api/payroll/ttk-get-by-id.php',
  TTK_LOG: 'php/api/payroll/ttk-log.php',
  TTK_PAYMENT_TYPES: 'php/api/payroll/ttk-payment-types.php',
  PAYMENT_TYPES_CATALOG: 'php/api/payroll/payment-types-catalog.php',
  INVOICE_NOTE_STATUS: 'php/api/payroll/invoice-note-status.php',
  INVOICE_STATEMENT_PDF: 'php/api/payroll/invoice-statement-pdf.php',
  INVOICE_STATEMENT_LOG: 'php/api/payroll/invoice-statement-log.php',
  INVOICE_STATEMENT_SEND_EMAIL: 'php/api/payroll/invoice-statement-send-email.php',
  EMAIL_ACTIVE_QUEUE: 'php/api/payroll/email-active-queue.php',
  INVOICE_SENT_EMAIL_ACCOUNTS: 'php/api/payroll/invoice-sent-email-accounts.php',
  INVOICE_STATEMENT_EMAIL_LOG: 'php/api/payroll/invoice-statement-email-log.php',
  TTK_SAVE_PAYMENT: 'php/api/payroll/ttk-save-payment.php',
  DEALERS: 'php/api/payroll/dealers.php',
  ME: 'php/api/payroll/me.php',
  ROLES_LIST: 'php/api/payroll/roles-list.php',
  ROLES_PERMISSIONS: 'php/api/payroll/roles-permissions.php',
  ROLES_SAVE: 'php/api/payroll/roles-save.php',
  ROLES_ACTIONS: 'php/api/payroll/roles-actions.php',
  ROLES_USERS: 'php/api/payroll/roles-users.php',
  ROLES_DEPARTMENTS: 'php/api/payroll/roles-departments.php',
} as const

/** Face recognition paths proxied via `/api/face/[...path]`. */
export const FaceProxyPath = {
  EMPLOYEE_THUMBNAIL: (uuid: string) => `/api/face/api/employeeThumbnail/${encodeURIComponent(uuid)}`,
  EMPLOYEE_PUNCH_PHOTOS: (id: number | string) =>
    `/api/face/api/employeePunchPhotos/${encodeURIComponent(String(id))}`,
} as const
