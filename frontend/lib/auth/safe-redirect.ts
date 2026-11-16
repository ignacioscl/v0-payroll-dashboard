/**
 * Solo los dos destinos que se usan (require-session.ts y login/layout.tsx). Antes aceptaba cualquier ruta que
 * empezara con «/», y `/\\otro.com` mandaba a otro sitio (redirección abierta; plans/plan-buenas-practicas-v0, 3.12).
 */
const ALLOWED_REDIRECTS = new Set(['/login', '/login?error=forbidden'])

export function safeRedirectPath(to: string | null): string {
  return to && ALLOWED_REDIRECTS.has(to) ? to : '/login'
}
