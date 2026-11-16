/**
 * Tiempo máximo de cada pedido del servidor de Next a otro servicio (plans/plan-buenas-practicas-v0, 2.6; regla
 * `.cursor/rules/payroll-api-proxy.mdc`). Todos cuentan **hasta que llegan los encabezados** de la respuesta: el body
 * (exports, adjuntos, PDF) no tiene corte propio, como hoy. Un tiempo vencido responde 504; un servicio caído, 502.
 */

/** `me.php`: corre en cada carga del panel y contesta en menos de 1 s; 20 s deja margen si PHP-FPM está ocupado. */
export const SRS_ME_TIMEOUT_MS = 20_000
/** `exchange.php`, `login.php`, `adopt.php`: el login. */
export const SRS_SSO_TIMEOUT_MS = 15_000
/**
 * Proxy genérico `/api/srs/…` y los demás `srsFetch`. Es la espera de encabezados que ya corta hoy el `fetch` de Node
 * (undici, 300 s): no corta nada que hoy ande. Bajarlo necesita medir (tarea `medir-tiempos-upstream-v0`).
 */
export const SRS_PROXY_TIMEOUT_MS = 300_000
/** `fetchBackend` (Nest). Igual que el proxy al PHP. */
export const BACKEND_TIMEOUT_MS = 300_000
/** Los pedidos al Node de adjuntos de gastos, hasta que contesta; la subida o bajada del archivo no se corta. */
export const NODE_TICKETS_TIMEOUT_MS = 60_000
/** Fotos de ponchadas (Face). */
export const FACE_TIMEOUT_MS = 60_000
