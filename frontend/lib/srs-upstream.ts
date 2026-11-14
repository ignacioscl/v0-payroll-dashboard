/**
 * Server-side calls to SRS PHP (Apache vhost).
 * Node fetch() cannot set the Host header; use SRS_API_URL with the vhost hostname
 * (e.g. http://srs.com) or we fall back to node:http with Host from SRS_PUBLIC_URL.
 */

import 'server-only'

import http from 'node:http'
import https from 'node:https'

import { fetchWithHeadersTimeout, timeoutError } from '@/lib/upstream-fetch'
import { SRS_PROXY_TIMEOUT_MS } from '@/lib/upstream-timeouts'

export function getSrsApiBaseUrl(): string {
  const url = process.env.SRS_API_URL?.trim()
  if (!url) {
    throw new Error('SRS_API_URL is not configured')
  }
  return url.replace(/\/$/, '')
}

/** Hostname for Apache VirtualHost (e.g. srs.com). */
export function getSrsUpstreamHost(): string | null {
  const explicit = process.env.SRS_API_HOST?.trim()
  if (explicit) {
    return explicit
  }
  const publicUrl = process.env.SRS_PUBLIC_URL?.trim()
  if (!publicUrl) {
    return null
  }
  try {
    return new URL(publicUrl).host
  } catch {
    return null
  }
}

function buildUpstreamUrl(path: string): URL {
  const base = getSrsApiBaseUrl()
  return path.startsWith('http')
    ? new URL(path)
    : new URL(path.replace(/^\//, ''), `${base}/`)
}

function nodeHttpFetch(
  target: URL,
  hostHeader: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const method = init?.method ?? 'GET'
  const headers: Record<string, string> = {}
  if (init?.headers) {
    const h = new Headers(init.headers)
    h.forEach((value, key) => {
      if (key.toLowerCase() !== 'host') {
        headers[key] = value
      }
    })
  }
  headers.Host = hostHeader

  const body =
    init?.body != null && method !== 'GET' && method !== 'HEAD'
      ? typeof init.body === 'string'
        ? init.body
        : Buffer.from(init.body as ArrayBuffer)
      : undefined

  const lib = target.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    // Hasta el evento `response` (los encabezados); el body no tiene corte propio. El `signal` de http.request
    // rechaza con AbortError, no con TimeoutError: por eso el temporizador propio (se arma abajo, después del req).
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
      },
      (res) => {
        clearTimeout(timer)
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          resolve(
            new Response(buf, {
              status: res.statusCode ?? 500,
              statusText: res.statusMessage,
              headers: res.headers as HeadersInit,
            }),
          )
        })
      },
    )
    const timer = setTimeout(() => {
      const err = timeoutError(timeoutMs)
      req.destroy(err)
      reject(err)
    }, timeoutMs)
    const outer = init?.signal
    if (outer) {
      const onAbort = () => req.destroy(outer.reason)
      if (outer.aborted) onAbort()
      else outer.addEventListener('abort', onAbort, { once: true })
    }
    req.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

/**
 * `timeoutMs` cuenta hasta los encabezados (por defecto `SRS_PROXY_TIMEOUT_MS`); vencido, rechaza con `TimeoutError`.
 */
export async function fetchSrsUpstream(
  path: string,
  init?: RequestInit,
  { timeoutMs = SRS_PROXY_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Response> {
  const target = buildUpstreamUrl(path)
  const vhost = getSrsUpstreamHost()

  if (vhost && target.host !== vhost) {
    return nodeHttpFetch(target, vhost, init, timeoutMs)
  }

  return fetchWithHeadersTimeout(target.toString(), { ...init, cache: 'no-store' }, timeoutMs)
}
