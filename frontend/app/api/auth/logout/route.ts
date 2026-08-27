import { NextRequest, NextResponse } from 'next/server'
import { appPublicUrl } from '@/lib/app-public-url'
import { buildClearSessionCookies, getSrsSession } from '@/lib/auth/session'
import { buildLegacyLogoutUrl } from '@/lib/legacy-origin'

export const dynamic = 'force-dynamic'

async function redirectToLegacyLogout(request: NextRequest) {
  const session = await getSrsSession()
  const v0Login = appPublicUrl('/login', request).toString()
  const response = NextResponse.redirect(
    buildLegacyLogoutUrl(session?.user.legacyOrigin, v0Login),
  )
  for (const cookie of buildClearSessionCookies()) {
    response.cookies.set(cookie)
  }
  return response
}

export async function GET(request: NextRequest) {
  return redirectToLegacyLogout(request)
}

export async function POST(request: NextRequest) {
  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('application/json')) {
    const session = await getSrsSession()
    const v0Login = appPublicUrl('/login', request).toString()
    const response = NextResponse.json({
      ok: true,
      legacyLogoutUrl: buildLegacyLogoutUrl(session?.user.legacyOrigin, v0Login).toString(),
    })
    for (const cookie of buildClearSessionCookies()) {
      response.cookies.set(cookie)
    }
    return response
  }
  return redirectToLegacyLogout(request)
}
