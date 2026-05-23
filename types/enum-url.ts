/** BFF routes served by this Next app (not SRS upstream). */
export enum UrlEnum {
  AUTH_SESSION = '/api/auth/session',
  DEALERS = '/api/dealers',
}

/** SRS paths proxied via `/api/srs/[...path]`. */
export const SrsProxyPath = {
  TTK_LIST: '/api/srs/php/api/payroll/ttk-list.php',
} as const
