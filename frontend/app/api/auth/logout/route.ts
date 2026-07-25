import { NextRequest, NextResponse } from 'next/server'
import { appPublicUrl } from '@/lib/app-public-url'
import { buildClearSessionCookies } from '@/lib/auth/session'

function redirectToV0Login(request?: NextRequest) {
  const response = NextResponse.redirect(appPublicUrl('/login', request))
  for (const cookie of buildClearSessionCookies()) {
    response.cookies.set(cookie)
  }
  return response
}

export async function GET(request: NextRequest) {
  return redirectToV0Login(request)
}

export async function POST(request: NextRequest) {
  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('application/json')) {
    const response = NextResponse.json({ ok: true })
    for (const cookie of buildClearSessionCookies()) {
      response.cookies.set(cookie)
    }
    return response
  }
  return redirectToV0Login(request)
}
