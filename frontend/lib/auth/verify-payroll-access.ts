import 'server-only'
import { srsFetch } from '@/lib/srs-fetch'
import { UpstreamUnavailableError } from '@/lib/upstream-error'
import { SRS_ME_TIMEOUT_MS } from '@/lib/upstream-timeouts'
import type { SrsMeResponse } from './types'
import { getSrsSession } from './session'

export type PayrollAccessCheck = 'no_session' | 'ok' | 'forbidden' | 'invalid'

/**
 * Validates JWT session against payroll/me.php (idRolSystemV2 or admin).
 *
 * `me.php` contesta siempre 200 cuando anda (el 401/403 va en `error.code`), así que un 5xx nunca es «sesión
 * inválida»: el PHP colgado (504 del proxy a los `SRS_ME_TIMEOUT_MS`), caído (502) o con la base caída (500 en HTML)
 * tira `UpstreamUnavailableError` antes de leer el JSON. La atrapa `app/error.tsx` (tarjeta con «Try again») y la
 * sesión no se borra (plans/plan-buenas-practicas-v0, 2.6.8).
 */
export async function checkPayrollDashboardAccess(): Promise<PayrollAccessCheck> {
  const session = await getSrsSession()
  if (!session) {
    return 'no_session'
  }

  const upstream = await srsFetch('php/api/payroll/me.php', { timeoutMs: SRS_ME_TIMEOUT_MS })
  if (upstream.status >= 500) {
    throw new UpstreamUnavailableError(upstream.status)
  }
  let json: SrsMeResponse
  try {
    json = (await upstream.json()) as SrsMeResponse
  } catch {
    return 'invalid'
  }

  const errCode = json.error?.code != null ? String(json.error.code) : ''
  if (upstream.status === 403 || errCode === '403') {
    return 'forbidden'
  }
  if (!upstream.ok || json.status === 'fail' || !json.data?.user) {
    return 'invalid'
  }

  return 'ok'
}
