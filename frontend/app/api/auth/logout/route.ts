import { NextRequest, NextResponse } from 'next/server'
import { appPublicUrl } from '@/lib/app-public-url'
import { buildClearSessionCookies, getSrsSession } from '@/lib/auth/session'
import { buildLegacyLogoutUrl } from '@/lib/legacy-origin'

export const dynamic = 'force-dynamic'

/**
 * Cerrar sesión: solo por POST (un form del menú; plans/plan-buenas-practicas-v0, 3.12). La doc de Next pide que las
 * mutaciones no vayan por GET. Responde 303 al logout.php del legacy (con 307 el navegador repetiría el POST ahí), que
 * borra sus cookies y vuelve al login de PRO. Recarga el documento, como pide la regla de navegación.
 */
export async function POST(request: NextRequest) {
  const session = await getSrsSession()
  const v0Login = appPublicUrl('/login', request).toString()
  const response = NextResponse.redirect(buildLegacyLogoutUrl(session?.user.legacyOrigin, v0Login), 303)
  for (const cookie of buildClearSessionCookies()) {
    response.cookies.set(cookie)
  }
  return response
}

export function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405, headers: { Allow: 'POST' } })
}
