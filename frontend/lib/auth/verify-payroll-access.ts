import { srsFetch } from '@/lib/srs-fetch'
import type { SrsMeResponse } from './types'
import { getSrsSession } from './session'

export type PayrollAccessCheck = 'no_session' | 'ok' | 'forbidden' | 'invalid'

/**
 * Validates JWT session against payroll/me.php (idRolSystemV2 or admin).
 */
export async function checkPayrollDashboardAccess(): Promise<PayrollAccessCheck> {
  const session = await getSrsSession()
  if (!session) {
    return 'no_session'
  }

  const upstream = await srsFetch('php/api/payroll/me.php')
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
