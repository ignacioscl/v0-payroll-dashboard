import { NextResponse } from 'next/server'
import { exchangeSsoCode } from '@/lib/srs-api'
import { buildSessionCookies } from '@/lib/auth/session'
import { appPublicUrl } from '@/lib/app-public-url'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(appPublicUrl('/auth/error?reason=missing_code', request))
  }

  try {
    const data = await exchangeSsoCode(code)
    const response = NextResponse.redirect(appPublicUrl('/', request))

    for (const cookie of buildSessionCookies({ token: data.token, user: data.user })) {
      response.cookies.set(cookie)
    }

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'exchange_failed'
    return NextResponse.redirect(
      appPublicUrl(`/auth/error?reason=${encodeURIComponent(message)}`, request),
    )
  }
}
