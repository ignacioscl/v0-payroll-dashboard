import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { srsFetch } from '@/lib/srs-fetch'
import { mapContratistasToDealerOptions } from '@/lib/srs-dealers'

type SrsPayrollDealersResponse = {
  status?: string
  error?: { message?: string }
  data?: {
    dealers?: { id: string; label: string }[]
    results?: { id: string | number; text: string }[]
  }
}

async function readSrsJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 280)
    throw new Error(
      `SRS returned HTML instead of JSON (${response.status}). ${preview}`,
    )
  }
}

export async function GET() {
  const session = await getSrsSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const upstream = await srsFetch('php/api/payroll/dealers.php')

    const json = await readSrsJson<SrsPayrollDealersResponse>(upstream)

    if (!upstream.ok || json.status === 'fail') {
      return NextResponse.json(
        {
          error: json.error?.message ?? 'Failed to load dealers',
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
