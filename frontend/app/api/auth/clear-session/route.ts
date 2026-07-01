import { NextRequest, NextResponse } from 'next/server'
import { buildClearSessionCookies } from '@/lib/auth/session'
import { appPublicUrl } from '@/lib/app-public-url'

function safeRedirectPath(to: string | null): string {
  if (!to || !to.startsWith('/') || to.startsWith('//')) {
    return '/login'
  }
  return to
}

function responseWithClearedCookies(request: NextRequest, to: string | null) {
  const path = safeRedirectPath(to)
  const response = NextResponse.redirect(appPublicUrl(path, request))
  for (const cookie of buildClearSessionCookies()) {
    response.cookies.set(cookie)
  }
  return response
}

/** Clears SRS session cookies (allowed here; not in Server Components). */
export async function GET(request: NextRequest) {
  return responseWithClearedCookies(request, request.nextUrl.searchParams.get('to'))
}
