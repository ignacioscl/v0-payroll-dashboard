const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

/**
 * Cuerpo de la respuesta de un proxy hacia el backend. Un 204 (o 205/304) no admite cuerpo, ni
 * siquiera vacío: `new Response(buf, { status: 204 })` tira TypeError y el navegador recibe un 500
 * aunque el backend haya hecho el cambio.
 */
export function proxyResponseBody(status: number, body: ArrayBuffer): ArrayBuffer | null {
  return NULL_BODY_STATUSES.has(status) ? null : body
}

/**
 * Los encabezados de seguridad que el Nest pone en una respuesta puntual: el logo SVG subido antes de D8 va encerrado
 * con una CSP `sandbox` (plans/plan-buenas-practicas-v0, 3.6). El proxy copia esa CSP (solo si encierra) y `nosniff`;
 * la CSP general de helmet no pasa (la del sitio la pone next.config.mjs).
 */
export function securityHeadersFrom(upstream: Response): Record<string, string> {
  const out: Record<string, string> = {}
  const csp = upstream.headers.get('Content-Security-Policy')
  if (csp && /\bsandbox\b/.test(csp)) out['Content-Security-Policy'] = csp
  const nosniff = upstream.headers.get('X-Content-Type-Options')
  if (nosniff) out['X-Content-Type-Options'] = nosniff
  return out
}
