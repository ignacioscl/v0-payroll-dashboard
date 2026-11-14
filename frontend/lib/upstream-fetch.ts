/**
 * `fetch` con tiempo máximo hasta los encabezados (plans/plan-buenas-practicas-v0, 2.6.2).
 *
 * No `AbortSignal.timeout` pegado al `fetch`: ese cuenta el tiempo total y corta a mitad una descarga (un export
 * que manda los encabezados enseguida y escribe el archivo después). Acá el temporizador se apaga apenas llegan los
 * encabezados. Si el pedido del navegador (`init.signal`) se aborta, este también, antes o después.
 */

import 'server-only'

export const TIMEOUT_ERROR_NAME = 'TimeoutError'

export function timeoutError(ms: number): DOMException {
  return new DOMException(`The upstream did not answer within ${ms} ms`, TIMEOUT_ERROR_NAME)
}

export async function fetchWithHeadersTimeout(
  url: string | URL,
  init: RequestInit = {},
  ms: number,
): Promise<Response> {
  const controller = new AbortController()
  const outer = init.signal
  const onOuterAbort = () => controller.abort(outer?.reason)
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason)
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }
  const timer = setTimeout(() => controller.abort(timeoutError(ms)), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    // undici rechaza con el `reason` del abort; si no, se normaliza a TimeoutError.
    if (controller.signal.aborted && controller.signal.reason instanceof DOMException) {
      const reason = controller.signal.reason
      if (reason.name === TIMEOUT_ERROR_NAME) throw reason
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export function isTimeoutError(err: unknown): boolean {
  const e = err as { name?: string; cause?: { name?: string } } | null
  return e?.name === TIMEOUT_ERROR_NAME || e?.cause?.name === TIMEOUT_ERROR_NAME
}
