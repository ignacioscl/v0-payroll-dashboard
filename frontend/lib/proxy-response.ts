const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

/**
 * Cuerpo de la respuesta de un proxy hacia el backend. Un 204 (o 205/304) no admite cuerpo, ni
 * siquiera vacío: `new Response(buf, { status: 204 })` tira TypeError y el navegador recibe un 500
 * aunque el backend haya hecho el cambio.
 */
export function proxyResponseBody(status: number, body: ArrayBuffer): ArrayBuffer | null {
  return NULL_BODY_STATUSES.has(status) ? null : body
}
