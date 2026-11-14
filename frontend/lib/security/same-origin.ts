/**
 * Chequeo de origen de los pedidos que cambian algo (plans/plan-buenas-practicas-v0, 3.12). `sameSite: 'lax'` deja pasar
 * un POST desde otro subdominio del mismo sitio (el legacy en main.srssuite.com): si el `Origin` no es el de PRO, 403.
 * Sin `Origin` pasa: un navegador siempre lo manda en un POST, y un pedido sin navegador no lleva las cookies de nadie.
 * Es la misma comparación que hace Next con las Server Actions (doc `02-guides/data-security.md`).
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** El host público de PRO: `PAYROLL_PUBLIC_URL` si está; si no, el que trae el pedido (detrás de Apache, x-forwarded-host). */
export function expectedHost(headers: Headers, env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.PAYROLL_PUBLIC_URL?.trim()
  if (explicit) {
    try {
      return new URL(explicit).host
    } catch {
      /* cae al del pedido */
    }
  }
  return (headers.get('x-forwarded-host') ?? headers.get('host'))?.split(',')[0].trim() || null
}

/** true si el pedido se puede atender; false → 403. Se compara el host (en dev el proto que llega no es confiable). */
export function isAllowedOrigin(method: string, headers: Headers, env: NodeJS.ProcessEnv = process.env): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true
  const origin = headers.get('origin')
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const host = expectedHost(headers, env)
  return host !== null && originHost === host
}
