/**
 * Encabezados de seguridad (plans/plan-buenas-practicas-v0, 2.4; regla `.cursor/rules/security-headers-and-errors.mdc`).
 *
 * CSP sin nonce, la de la doc de Next (`02-guides/content-security-policy.md`, «Without Nonces»): el nonce obliga a
 * que todo sea dinámico. Se aparta en una cosa: sin `upgrade-insecure-requests`, porque el local corre en
 * http://pro.srs.com y los e2e en http; en PROD lo cubre HSTS. Todo lo que carga PRO es del mismo origen, `blob:`
 * (los PDF) o `data:`. Si aparece un error de CSP, se agrega el origen puntual con su motivo en el plan; nunca `*`.
 */
const isDev = process.env.NODE_ENV === 'development'

/**
 * Orígenes del legacy (`SRS_LEGACY_ORIGINS`, separados por coma): el logout y «Back to legacy» salen por un form POST
 * que redirige (303) al legacy, y Chrome aplica `form-action` también a esa redirección (plans/plan-buenas-practicas-v0,
 * 3.12). Next calcula `headers()` al compilar: la variable tiene que llegar al build (Dockerfile, ARG).
 */
const legacyOrigins = (process.env.SRS_LEGACY_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter((o) => /^https?:\/\/[^\s/]+$/.test(o))

export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  ["form-action 'self'", ...legacyOrigins].join(' '),
  "frame-ancestors 'none'",
].join('; ')

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Sin «X-Powered-By: Next.js».
  poweredByHeader: false,
  allowedDevOrigins: ['pro.srs.com', 'prosrs.com', 'www.prosrs.com', 'srs.com'],
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
