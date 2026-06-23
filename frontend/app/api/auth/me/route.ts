import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { srsFetch } from '@/lib/srs-fetch'
import type { SrsMeResponse } from '@/lib/auth/types'

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
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  try {
    const upstream = await srsFetch('php/api/payroll/me.php')
    const json = await readSrsJson<SrsMeResponse>(upstream)

    if (!upstream.ok || json.status === 'fail') {
      return NextResponse.json(
        {
          authenticated: false,
          error: json.error?.message ?? 'Failed to load user profile',
        },
        { status: json.error?.code === '403' || json.error?.code === 403 ? 403 : upstream.status >= 400 ? upstream.status : 400 },
      )
    }

    if (!json.data?.user) {
      return NextResponse.json(
        { authenticated: false, error: 'Invalid me response' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      authenticated: true,
      user: json.data.user,
      permissionIds: json.data.permissionIds ?? [],
      permissions: json.data.permissions ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ authenticated: false, error: message }, { status: 500 })
  }
}
