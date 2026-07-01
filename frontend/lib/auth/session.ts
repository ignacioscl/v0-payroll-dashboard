import { cookies } from 'next/headers'
import type { SrsSession, SrsSessionUser } from './types'
import { SRS_TOKEN_COOKIE, SRS_USER_COOKIE, SRS_SESSION_MAX_AGE } from './constants'

export async function getSrsSession(): Promise<SrsSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SRS_TOKEN_COOKIE)?.value
  const userRaw = cookieStore.get(SRS_USER_COOKIE)?.value

  if (!token || !userRaw) {
    return null
  }

  try {
    const user = JSON.parse(userRaw) as SrsSessionUser
    if (!user?.id) {
      return null
    }
    return { token, user }
  } catch {
    return null
  }
}

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
  const base = {
    httpOnly: true,
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
