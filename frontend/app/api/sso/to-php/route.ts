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

/**
 * Volver al legacy: solo por POST (form del menú; plans/plan-buenas-practicas-v0, 3.12), porque crea un código de un
 * solo uso en el PHP. Responde 303 (con 307 el navegador repetiría el POST en el legacy).
 */
export async function POST(request: Request) {
  try {
    const session = await getSrsSession()

    if (!session) {
      return NextResponse.redirect(appPublicUrl('/login', request), 303)
    }

    const legacyBase = resolveLegacyPublicUrl(session.user.legacyOrigin)

    try {
      const code = await createPhpAdoptCode(session.token, session.user)
      return NextResponse.redirect(legacyConsumeUrl(legacyBase, code), 303)
    } catch (err) {
      console.error('[sso/to-php] adopt failed:', err)
      return NextResponse.redirect(legacyIndexUrl(legacyBase), 303)
    }
  } catch (err) {
    console.error('[sso/to-php] unhandled:', err)
    const fallback = resolveLegacyPublicUrl(null)
    return NextResponse.redirect(legacyIndexUrl(fallback), 303)
  }
}

export function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405, headers: { Allow: 'POST' } })
}
