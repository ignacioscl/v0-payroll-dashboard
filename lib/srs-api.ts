import type { SrsExchangeResponse } from '@/lib/auth/types'

function getSrsApiBaseUrl(): string {
  const url = process.env.SRS_API_URL?.trim()
  if (!url) {
    throw new Error('SRS_API_URL is not configured')
  }
  return url.replace(/\/$/, '')
}

export async function exchangeSsoCode(code: string) {
  const secret = process.env.SRS_SSO_SECRET?.trim()
  if (!secret) {
    throw new Error('SRS_SSO_SECRET is not configured')
  }

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
      `SRS returned HTML instead of JSON (${res.status}). Check PHP at ${getSrsApiBaseUrl()}/php/api/sso/exchange.php — ${preview}`
    )
  }

  if (!res.ok || json.status !== 'success' || !json.data?.token) {
    const message = json.error?.message || 'SSO exchange failed'
    throw new Error(message)
  }

  return json.data
}
