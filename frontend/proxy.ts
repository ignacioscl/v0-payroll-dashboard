import { NextResponse, type NextRequest } from 'next/server'

import { appPublicUrl } from '@/lib/app-public-url'
import { SRS_TOKEN_COOKIE, SRS_USER_COOKIE } from '@/lib/auth/constants'
import { parseSessionUserCookie } from '@/lib/auth/session-cookie'
import { isAllowedOrigin } from '@/lib/security/same-origin'

/**
 * Proxy de Next 16 (reemplaza a `middleware`; doc `03-api-reference/03-file-conventions/proxy.md`). Solo revisiones
 * rápidas, sin ningún pedido a otro servicio, porque corre en cada pedido y en cada precarga (regla global;
 * `02-guides/authentication.md`, «Optimistic checks with Proxy»). Pruebas en `lib/proxy.test.ts`.
 *
 * - En `/api`: solo el chequeo de origen de los POST/PUT/DELETE (plans/plan-buenas-practicas-v0, 3.12). La sesión la
 *   revisa cada route handler y contesta 401.
 * - En las pantallas (4.6): sin cookie de sesión → `/login`; usuario externo en `/` → Punch Report. La lista de
 *   pantallas privadas sale de la estructura de carpetas: el `matcher` toma todo salvo `api`, `auth` (el callback del
 *   SSO pone la cookie), `login` (lo mira el healthcheck), los estáticos de `_next` y los archivos con punto.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    if (!isAllowedOrigin(request.method, request.headers)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.next()
  }

  const token = request.cookies.get(SRS_TOKEN_COOKIE)?.value
  const user = parseSessionUserCookie(request.cookies.get(SRS_USER_COOKIE)?.value)
  if (!token || !user) {
    return NextResponse.redirect(appPublicUrl('/login', request))
  }
  if (pathname === '/' && user.isCompanyTypeCompany) {
    return NextResponse.redirect(appPublicUrl('/issues', request))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/((?!api|auth|login|_next/static|_next/image|.*\\..*).*)'],
}
