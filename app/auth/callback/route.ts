import { NextResponse } from 'next/server'
import { exchangeSsoCode } from '@/lib/srs-api'
import { buildSessionCookies } from '@/lib/auth/session'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/auth/error?reason=missing_code', request.url))
  }

  try {
    const data = await exchangeSsoCode(code)
    const response = NextResponse.redirect(new URL('/', request.url))

    for (const cookie of buildSessionCookies({ token: data.token, user: data.user })) {
      response.cookies.set(cookie)
    }

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'exchange_failed'
    return NextResponse.redirect(
      new URL(`/auth/error?reason=${encodeURIComponent(message)}`, request.url)
    )
  }
}
