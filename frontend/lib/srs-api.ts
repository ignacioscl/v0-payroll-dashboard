import 'server-only'
import type { SrsExchangeResponse, SrsLoginData } from '@/lib/auth/types'
import { isLoginRoleSelection } from '@/lib/auth/types'
import { fetchSrsUpstream } from '@/lib/srs-upstream'
import { UPSTREAM_UNEXPECTED_MESSAGE, upstreamErrorMessage } from '@/lib/upstream-error'
import { SRS_SSO_TIMEOUT_MS } from '@/lib/upstream-timeouts'

/**
 * Login y SSO contra el PHP, con `SRS_SSO_TIMEOUT_MS` hasta los encabezados. Si no contesta o no se puede conectar, el
 * error lleva el texto de D1 (lo muestran el formulario de login y `/auth/error`), nunca «The operation was aborted».
 */
async function fetchSso(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchSrsUpstream(path, init, { timeoutMs: SRS_SSO_TIMEOUT_MS })
  } catch (err) {
    console.error('SSO upstream failed', { path, name: (err as Error)?.name, message: (err as Error)?.message })
    throw new Error(upstreamErrorMessage(err))
  }
}

/** El PHP devolvió algo que no es JSON (HTML de error): el detalle al log del servidor, al usuario el texto de D1. */
function unexpectedResponse(path: string, status: number, text: string): Error {
  console.error('SSO upstream returned non-JSON', { path, status, preview: text.replace(/\s+/g, ' ').slice(0, 280) })
  return new Error(UPSTREAM_UNEXPECTED_MESSAGE)
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

  const res = await fetchSso('/php/api/sso/exchange.php', {
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
    throw unexpectedResponse('exchange.php', res.status, text)
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
  const res = await fetchSso('/php/api/sso/login.php', {
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
    throw unexpectedResponse('login.php', res.status, text)
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
  const res = await fetchSso('/php/api/sso/adopt.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Sso-Secret': getSsoSecret(),
    },
    body: JSON.stringify({ token, user }),
    cache: 'no-store',
  })

  const text = await res.text()
  let json: { status?: string; data?: { code?: string }; error?: { message?: string } }
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    throw unexpectedResponse('adopt.php', res.status, text)
  }

  if (!res.ok || json.status !== 'success' || !json.data?.code) {
    throw new Error(json.error?.message || 'Failed to open SRS Legacy session')
  }
  return json.data.code as string
}
