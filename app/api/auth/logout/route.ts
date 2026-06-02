import { NextResponse } from 'next/server'
import { buildClearSessionCookies } from '@/lib/auth/session'

function getPhpLogoutUrl() {
  const base = (process.env.SRS_PUBLIC_URL ?? 'http://srs.com').replace(/\/$/, '')
  return `${base}/logout.php`
}

export async function GET() {
  const response = NextResponse.redirect(getPhpLogoutUrl())
  for (const cookie of buildClearSessionCookies()) {
    response.cookies.set(cookie)
  }
  return response
}

export async function POST(request: Request) {
  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('application/json')) {
    const response = NextResponse.json({ ok: true })
    for (const cookie of buildClearSessionCookies()) {
      response.cookies.set(cookie)
    }
    return response
  }
  return GET()
}
