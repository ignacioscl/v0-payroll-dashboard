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
  TTK_EDIT: 'php/api/payroll/ttk-edit.php',
  TTK_GET_BY_ID: 'php/api/payroll/ttk-get-by-id.php',
  DEALERS: 'php/api/payroll/dealers.php',
  ME: 'php/api/payroll/me.php',
} as const

/** Face recognition paths proxied via `/api/face/[...path]`. */
export const FaceProxyPath = {
  EMPLOYEE_THUMBNAIL: (uuid: string) => `/api/face/api/employeeThumbnail/${encodeURIComponent(uuid)}`,
  EMPLOYEE_PUNCH_PHOTOS: (id: number | string) =>
    `/api/face/api/employeePunchPhotos/${encodeURIComponent(String(id))}`,
} as const
