/** BFF routes served by this Next app (not SRS upstream). */
export enum UrlEnum {
  AUTH_SESSION = '/api/auth/session',
  DEALERS = '/api/dealers',
}

/** SRS paths proxied via `/api/srs/[...path]`. */
export const SrsProxyPath = {
  TTK_LIST: '/api/srs/php/api/payroll/ttk-list.php',
  TTK_ISSUE_COUNTS: '/api/srs/php/api/payroll/ttk-issue-counts.php',
} as const

/** Face recognition paths proxied via `/api/face/[...path]`. */
export const FaceProxyPath = {
  EMPLOYEE_THUMBNAIL: (uuid: string) => `/api/face/api/employeeThumbnail/${encodeURIComponent(uuid)}`,
  EMPLOYEE_PUNCH_PHOTOS: (id: number | string) =>
    `/api/face/api/employeePunchPhotos/${encodeURIComponent(String(id))}`,
} as const
