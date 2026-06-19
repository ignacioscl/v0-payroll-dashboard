import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { createPhpAdoptCode } from '@/lib/srs-api'
import { appPublicUrl } from '@/lib/app-public-url'
import { resolveLegacyPublicUrl } from '@/lib/legacy-origin'

export const dynamic = 'force-dynamic'

function legacyIndexUrl(legacyBase: string): string {
  return `${legacyBase}/index.php`
}

function legacyConsumeUrl(legacyBase: string, code: string): string {
  return `${legacyBase}/php/api/sso/consume.php?code=${encodeURIComponent(code)}`
}

export async function GET(request: Request) {
  try {
    const session = await getSrsSession()

    if (!session) {
      return NextResponse.redirect(appPublicUrl('/login', request))
    }

    const legacyBase = resolveLegacyPublicUrl(session.user.legacyOrigin)

    try {
      const code = await createPhpAdoptCode(session.token, session.user)
      return NextResponse.redirect(legacyConsumeUrl(legacyBase, code))
    } catch (err) {
      console.error('[sso/to-php] adopt failed:', err)
      return NextResponse.redirect(legacyIndexUrl(legacyBase))
    }
  } catch (err) {
    console.error('[sso/to-php] unhandled:', err)
    const fallback = resolveLegacyPublicUrl(null)
    return NextResponse.redirect(legacyIndexUrl(fallback))
  }
}
