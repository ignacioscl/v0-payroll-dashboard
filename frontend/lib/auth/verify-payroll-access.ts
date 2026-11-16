import 'server-only'
import { cache } from 'react'
import { srsFetch } from '@/lib/srs-fetch'
import { UpstreamUnavailableError } from '@/lib/upstream-error'
import { SRS_ME_TIMEOUT_MS } from '@/lib/upstream-timeouts'
import type { SrsMeData, SrsMeResponse } from './types'
import { getSrsSession } from './session'

export type PayrollAccessCheck = 'no_session' | 'ok' | 'forbidden' | 'invalid'

export type PayrollMe = { access: 'ok'; me: SrsMeData } | { access: Exclude<PayrollAccessCheck, 'ok'>; me: null }

/**
 * Validates JWT session against payroll/me.php (idRolSystemV2 or admin).
 *
 * `me.php` contesta siempre 200 cuando anda (el 401/403 va en `error.code`), así que un 5xx nunca es «sesión
 * inválida»: el PHP colgado (504 del proxy a los `SRS_ME_TIMEOUT_MS`), caído (502) o con la base caída (500 en HTML)
 * tira `UpstreamUnavailableError` antes de leer el JSON. La atrapa `app/error.tsx` (tarjeta con «Try again») y la
 * sesión no se borra (plans/plan-buenas-practicas-v0, 2.6.8).
 *
 * Devuelve también los datos de `me.php`, y una sola vez por pedido (`cache`; 4.5): el layout del panel los siembra en
 * la caché del navegador y el menú llega lleno.
 */
export const getPayrollMe = cache(async (): Promise<PayrollMe> => {
  const session = await getSrsSession()
  if (!session) {
    return { access: 'no_session', me: null }
  }

  const upstream = await srsFetch('php/api/payroll/me.php', { timeoutMs: SRS_ME_TIMEOUT_MS })
  if (upstream.status >= 500) {
    throw new UpstreamUnavailableError(upstream.status)
  }
  let json: SrsMeResponse
  try {
    json = (await upstream.json()) as SrsMeResponse
  } catch {
    return { access: 'invalid', me: null }
  }

  const errCode = json.error?.code != null ? String(json.error.code) : ''
  if (upstream.status === 403 || errCode === '403') {
    return { access: 'forbidden', me: null }
  }
  if (!upstream.ok || json.status === 'fail' || !json.data?.user) {
    return { access: 'invalid', me: null }
  }

  return { access: 'ok', me: json.data }
})

export async function checkPayrollDashboardAccess(): Promise<PayrollAccessCheck> {
  return (await getPayrollMe()).access
}
