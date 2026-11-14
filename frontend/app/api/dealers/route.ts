import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { srsFetch } from '@/lib/srs-fetch'
import { mapContratistasToDealerOptions } from '@/lib/srs-dealers'
import { proxyErrorText, readUpstreamJson, UPSTREAM_UNEXPECTED_MESSAGE } from '@/lib/upstream-error'

type SrsPayrollDealersResponse = {
  status?: string
  error?: { message?: string }
  data?: {
    dealers?: { id: string; label: string }[]
    results?: { id: string | number; text: string }[]
  }
}

export async function GET() {
  const session = await getSrsSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const upstream = await srsFetch('php/api/payroll/dealers.php')

    const json = await readUpstreamJson<SrsPayrollDealersResponse>(upstream, 'dealers.php')

    if (!upstream.ok || json.status === 'fail') {
      return NextResponse.json(
        {
          error: proxyErrorText(json) ?? json.error?.message ?? 'Failed to load dealers',
        },
        { status: upstream.ok ? 400 : upstream.status },
      )
    }

    const raw = json.data?.dealers ?? json.data?.results
    const dealers = Array.isArray(raw)
      ? raw.every((d) => 'label' in d)
        ? (raw as { id: string; label: string }[])
        : mapContratistasToDealerOptions({ results: raw as { id: string | number; text: string }[] })
      : []

    return NextResponse.json({ dealers })
  } catch {
    // El detalle quedó en el log del servidor (readUpstreamJson); al navegador, el texto de D1.
    return NextResponse.json({ error: UPSTREAM_UNEXPECTED_MESSAGE }, { status: 502 })
  }
}
