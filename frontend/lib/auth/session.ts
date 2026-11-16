import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { SrsSession } from './types'
import { parseSessionUserCookie } from './session-cookie'
import { SRS_TOKEN_COOKIE, SRS_USER_COOKIE, SRS_SESSION_MAX_AGE } from './constants'

/**
 * Una sola lectura de la cookie por pedido (`cache` de React; plans/plan-buenas-practicas-v0, 4.5). Fuera de un render
 * (los route handlers) `cache` no guarda nada y se porta como una función común.
 */
export const getSrsSession = cache(async (): Promise<SrsSession | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SRS_TOKEN_COOKIE)?.value
  const userRaw = cookieStore.get(SRS_USER_COOKIE)?.value

  if (!token) {
    return null
  }
  const user = parseSessionUserCookie(userRaw)
  return user ? { token, user } : null
})

export function buildSessionCookies(session: SrsSession) {
  const secure = process.env.NODE_ENV === 'production'
  const base = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SRS_SESSION_MAX_AGE,
  }

  return [
    { name: SRS_TOKEN_COOKIE, value: session.token, ...base },
    { name: SRS_USER_COOKIE, value: JSON.stringify(session.user), ...base },
  ]
}

export function buildClearSessionCookies() {
  const secure = process.env.NODE_ENV === 'production'
  const base = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
  return [
    { name: SRS_TOKEN_COOKIE, value: '', ...base },
    { name: SRS_USER_COOKIE, value: '', ...base },
  ]
}

/** Use GET /api/auth/clear-session?to=... from Server Components (cookies cannot be set in layouts). */
export function clearSessionRedirectUrl(to: string): string {
  return `/api/auth/clear-session?to=${encodeURIComponent(to)}`
}
