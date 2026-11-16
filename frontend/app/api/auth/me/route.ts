import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { srsFetch } from '@/lib/srs-fetch'
import type { SrsMeResponse } from '@/lib/auth/types'
import { toMeQueryData } from '@/lib/auth/me-query'
import { proxyErrorText, readUpstreamJson, UPSTREAM_UNEXPECTED_MESSAGE } from '@/lib/upstream-error'
import { SRS_ME_TIMEOUT_MS } from '@/lib/upstream-timeouts'

export async function GET() {
  const session = await getSrsSession()
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  try {
    const upstream = await srsFetch('php/api/payroll/me.php', { timeoutMs: SRS_ME_TIMEOUT_MS })
    const json = await readUpstreamJson<SrsMeResponse>(upstream, 'me.php')

    if (!upstream.ok || json.status === 'fail') {
      return NextResponse.json(
        {
          authenticated: false,
          error: proxyErrorText(json) ?? json.error?.message ?? 'Failed to load user profile',
        },
        { status: String(json.error?.code) === '403' ? 403 : upstream.status >= 400 ? upstream.status : 400 },
      )
    }

    if (!json.data?.user) {
      return NextResponse.json(
        { authenticated: false, error: 'Invalid me response' },
        { status: 502 },
      )
    }

    return NextResponse.json({ authenticated: true, ...toMeQueryData(json.data) })
  } catch {
    // El detalle quedó en el log del servidor (readUpstreamJson); al navegador, el texto de D1.
    return NextResponse.json({ authenticated: false, error: UPSTREAM_UNEXPECTED_MESSAGE }, { status: 502 })
  }
}
