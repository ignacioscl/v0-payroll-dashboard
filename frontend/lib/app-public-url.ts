/**
 * URL pública del dashboard (https://pro.srssuite.com).
 * Detrás de Apache→Docker, request.url es http://0.0.0.0:3010 — no usarla para redirects al browser.
 */
export function getAppPublicOrigin(request?: Request): string {
  const explicit = process.env.PAYROLL_PUBLIC_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }

  if (request) {
    const headers = new Headers(request.headers)
    const host = headers.get('x-forwarded-host') ?? headers.get('host')
    const proto = headers.get('x-forwarded-proto') ?? 'https'
    if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.0.0.1')) {
      return `${proto}://${host.split(',')[0].trim()}`.replace(/\/$/, '')
    }
  }

  throw new Error(
    'PAYROLL_PUBLIC_URL is not configured (ej. https://pro.srssuite.com in payroll-dashboard.env)',
  )
}

export function appPublicUrl(path: string, request?: Request): URL {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return new URL(normalized, `${getAppPublicOrigin(request)}/`)
}
