import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { createPhpAdoptCode } from '@/lib/srs-api'
import { appPublicUrl } from '@/lib/app-public-url'

export async function GET(request: Request) {
  const session = await getSrsSession()
  const phpBase = (process.env.SRS_PUBLIC_URL ?? 'http://srs.com').replace(/\/$/, '')

  if (!session) {
    return NextResponse.redirect(appPublicUrl('/login', request))
  }

  try {
    const code = await createPhpAdoptCode(session.token, session.user)
    return NextResponse.redirect(
      `${phpBase}/php/api/sso/consume.php?code=${encodeURIComponent(code)}`
    )
  } catch {
    return NextResponse.redirect(`${phpBase}/index.php`)
  }
}
