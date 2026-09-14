/**
 * Dispara la bajada de un xlsx ya preparado por ticket (`prepare` → `status` →
 * descarga). Lo comparten el export de Punch Report (P4) y el del ranking de
 * dealers del Dashboard; `path` es la ruta de descarga del proxy, sin query
 * (p. ej. `/api/srs-kpis/punch/list/export`).
 *
 * Va por un `<a download>` y NO por un iframe oculto: un iframe de 0×0 apuntando
 * a una URL con `export?ticket=` es justo lo que cazan los bloqueadores de
 * contenido, y Chrome corta el pedido con `ERR_BLOCKED_BY_CLIENT` sin que la app
 * se entere —el ticket se prepara bien y el archivo nunca llega—. Un anchor con
 * `download` al mismo origen no lo toca ningún bloqueador y tampoco navega.
 */
export function startTicketDownload(path: string, ticket: string) {
  const a = document.createElement('a')
  a.href = `${path}?ticket=${encodeURIComponent(ticket)}`
  // El nombre real lo manda el server en Content-Disposition; esto es el fallback.
  a.download = ''
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // El anchor NO se saca en el mismo tick: el ticket es de un solo uso y el
  // servidor arma el archivo mientras lo transmite, así que la bajada vive
  // bastante después del click. Sacarlo enseguida la deja cancelada en 0 bytes.
  window.setTimeout(() => a.remove(), 60_000)
}
