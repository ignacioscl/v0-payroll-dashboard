import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { createPhpAdoptCode } from '@/lib/srs-api'
import { appPublicUrl } from '@/lib/app-public-url'
import { resolveLegacyPublicUrl } from '@/lib/legacy-origin'

export async function GET(request: Request) {
  const session = await getSrsSession()

  if (!session) {
    return NextResponse.redirect(appPublicUrl('/login', request))
  }

  const legacyBase = resolveLegacyPublicUrl(session.user.legacyOrigin)

  try {
    const code = await createPhpAdoptCode(session.token, session.user)
    return NextResponse.redirect(
      `${legacyBase}/php/api/sso/consume.php?code=${encodeURIComponent(code)}`,
    )
  } catch {
    return NextResponse.redirect(`${legacyBase}/index.php`)
  }
}
