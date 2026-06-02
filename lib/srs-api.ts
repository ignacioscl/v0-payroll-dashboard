import type { SrsExchangeResponse, SrsLoginData } from '@/lib/auth/types'
import { isLoginRoleSelection } from '@/lib/auth/types'

function getSrsApiBaseUrl(): string {
  const url = process.env.SRS_API_URL?.trim()
  if (!url) {
    throw new Error('SRS_API_URL is not configured')
  }
  return url.replace(/\/$/, '')
}

function getSsoSecret(): string {
  const secret = process.env.SRS_SSO_SECRET?.trim()
  if (!secret) {
    throw new Error('SRS_SSO_SECRET is not configured')
  }
  return secret
}

export async function exchangeSsoCode(code: string) {
  const secret = getSsoSecret()

  const res = await fetch(`${getSrsApiBaseUrl()}/php/api/sso/exchange.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Sso-Secret': secret,
    },
    body: JSON.stringify({ code }),
    cache: 'no-store',
  })

  const text = await res.text()
  let json: SrsExchangeResponse
  try {
    json = JSON.parse(text) as SrsExchangeResponse
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 280)
    throw new Error(
      `SRS server returned HTML instead of JSON (${res.status}). Check ${getSrsApiBaseUrl()}/php/api/sso/exchange.php — ${preview}`
    )
  }

  if (!res.ok || json.status !== 'success' || !json.data || !('token' in json.data) || !json.data.token) {
    const message = json.error?.message || 'SSO exchange failed'
    throw new Error(message)
  }

  return json.data as { token: string; user: import('@/lib/auth/types').SrsSessionUser }
}

export async function loginWithCredentials(
  email: string,
  password: string,
  idUsuarioRolrel?: number
) {
  const res = await fetch(`${getSrsApiBaseUrl()}/php/api/sso/login.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Sso-Secret': getSsoSecret(),
    },
    body: JSON.stringify({ email, password, idUsuarioRolrel: idUsuarioRolrel ?? null }),
    cache: 'no-store',
  })

  const text = await res.text()
  let json: SrsExchangeResponse
  try {
    json = JSON.parse(text) as SrsExchangeResponse
  } catch {
    throw new Error(`SRS returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok || json.status !== 'success' || !json.data) {
    throw new Error(json.error?.message || 'Login failed')
  }
  return json.data
}

export type LoginWithCredentialsResult =
  | { kind: 'session'; token: string; user: import('@/lib/auth/types').SrsSessionUser }
  | { kind: 'chooseRole'; rolesRel: import('@/lib/auth/types').SrsLoginRoleOption[] }

export async function loginWithCredentialsFlow(
  email: string,
  password: string,
  idUsuarioRolrel?: number
): Promise<LoginWithCredentialsResult> {
  const data: SrsLoginData = await loginWithCredentials(email, password, idUsuarioRolrel)

  if (isLoginRoleSelection(data)) {
    return { kind: 'chooseRole', rolesRel: data.rolesRel }
  }

  if (!('token' in data) || !data.token) {
    throw new Error('Login failed')
  }

  return { kind: 'session', token: data.token, user: data.user }
}

export async function createPhpAdoptCode(token: string, user: unknown) {
  const res = await fetch(`${getSrsApiBaseUrl()}/php/api/sso/adopt.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Sso-Secret': getSsoSecret(),
    },
    body: JSON.stringify({ token, user }),
    cache: 'no-store',
  })
  const json = await res.json()
  if (!res.ok || json.status !== 'success' || !json.data?.code) {
    throw new Error(json?.error?.message || 'Failed to open SRS Legacy session')
  }
  return json.data.code as string
}
