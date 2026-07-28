import { legacyLogoUrl } from '@/lib/face/face-proxy-url'

export interface ProviderBranding {
  /** #rrggbb, or null to use the product default. */
  accentColor: string | null
  /** File name to render — the v0 logo when there is one, the legacy one otherwise. */
  logoFile: string | null
  /** true → served by the Nest backend; false → a legacy upload under /uploads. */
  logoIsV0: boolean
}

const BASE_URL = '/api/srs-kpis/contratista/branding'

/** Nest's default `HttpException` body is `{ statusCode, message, error }`; `message` can be a string or array. */
async function parseNestErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] }
    if (Array.isArray(body.message)) return body.message.join(', ') || fallback
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  } catch {
    /* non-JSON body — fall back below */
  }
  return fallback
}

async function requestJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  if (!res.ok) throw new Error(await parseNestErrorMessage(res, fallback))
  return res.json() as Promise<T>
}

/**
 * Where to point an `<img>`. The v0 logo is streamed by the backend because the
 * browser only reaches Nest through the proxy; the file name doubles as the cache
 * buster, since every upload gets a fresh one.
 */
export function brandingLogoUrl(branding: ProviderBranding | undefined): string | null {
  if (!branding?.logoFile) return null
  if (!branding.logoIsV0) return legacyLogoUrl(branding.logoFile)
  return `${BASE_URL}/logo?v=${encodeURIComponent(branding.logoFile)}`
}

export function fetchProviderBranding(): Promise<ProviderBranding> {
  return requestJson<ProviderBranding>(BASE_URL, { method: 'GET' }, 'Could not load branding')
}

export function updateProviderAccent(accentColor: string | null): Promise<ProviderBranding> {
  return requestJson<ProviderBranding>(
    BASE_URL,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accentColor }),
    },
    'Could not save the accent colour',
  )
}

export function uploadProviderLogo(file: File): Promise<ProviderBranding> {
  const form = new FormData()
  form.append('file', file)
  // No Content-Type header on purpose: the browser sets it with the boundary.
  return requestJson<ProviderBranding>(
    `${BASE_URL}/logo`,
    { method: 'POST', body: form },
    'Could not upload the logo',
  )
}

export function deleteProviderLogo(): Promise<ProviderBranding> {
  return requestJson<ProviderBranding>(
    `${BASE_URL}/logo`,
    { method: 'DELETE' },
    'Could not remove the logo',
  )
}
