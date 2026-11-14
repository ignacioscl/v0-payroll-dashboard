import { NextResponse, type NextRequest } from 'next/server'

import { isAllowedOrigin } from '@/lib/security/same-origin'

/**
 * Proxy de Next 16 (reemplaza a `middleware`; doc `03-api-reference/03-file-conventions/proxy.md`). Solo revisiones
 * rápidas (regla global). En `/api`: el chequeo de origen de los POST/PUT/DELETE (plans/plan-buenas-practicas-v0, 3.12).
 * La etapa 4 le suma la revisión de la cookie en las pantallas (4.6), con sus tests en `lib/proxy.test.ts`.
 */
export function proxy(request: NextRequest) {
  if (!isAllowedOrigin(request.method, request.headers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
