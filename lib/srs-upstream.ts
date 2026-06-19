/**
 * Server-side calls to SRS PHP (Apache vhost).
 * Node fetch() cannot set the Host header; use SRS_API_URL with the vhost hostname
 * (e.g. http://srs.com) or we fall back to node:http with Host from SRS_PUBLIC_URL.
 */

import http from 'node:http'
import https from 'node:https'

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
  init?: RequestInit,
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
    req.on('error', reject)
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

export async function fetchSrsUpstream(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const target = buildUpstreamUrl(path)
  const vhost = getSrsUpstreamHost()

  if (vhost && target.host !== vhost) {
    return nodeHttpFetch(target, vhost, init)
  }

  return fetch(target.toString(), { ...init, cache: 'no-store' })
}

/**
 * Call a Legacy PHP endpoint on the user's vhost (e.g. mooi vs main).
 * Connects via SRS_API_URL but sends Host for the legacy origin when they differ.
 */
export async function fetchLegacyUpstream(
  legacyBase: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = legacyBase.replace(/\/$/, '')
  const target = path.startsWith('http')
    ? new URL(path)
    : new URL(path.replace(/^\//, ''), `${base}/`)

  const apiBase = new URL(getSrsApiBaseUrl())
  const legacyHost = target.host

  if (legacyHost !== apiBase.host) {
    const connectUrl = new URL(
      `${target.pathname}${target.search}`,
      `${apiBase.protocol}//${apiBase.host}/`,
    )
    return nodeHttpFetch(connectUrl, legacyHost, init)
  }

  return fetch(target.toString(), { ...init, cache: 'no-store' })
}
