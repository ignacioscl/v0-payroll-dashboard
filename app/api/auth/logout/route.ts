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

export async function POST() {
  return GET()
}
