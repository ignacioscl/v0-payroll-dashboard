/**
 * Encabezados de seguridad (plans/plan-buenas-practicas-v0, 2.4; regla `.cursor/rules/security-headers-and-errors.mdc`).
 *
 * CSP sin nonce, la de la doc de Next (`02-guides/content-security-policy.md`, «Without Nonces»): el nonce obliga a
 * que todo sea dinámico. Se aparta en una cosa: sin `upgrade-insecure-requests`, porque el local corre en
 * http://pro.srs.com y los e2e en http; en PROD lo cubre HSTS. Todo lo que carga PRO es del mismo origen, `blob:`
 * (los PDF) o `data:`. Si aparece un error de CSP, se agrega el origen puntual con su motivo en el plan; nunca `*`.
 */
const isDev = process.env.NODE_ENV === 'development'

export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
