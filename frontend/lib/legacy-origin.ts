/** Normalize `https://host` (no trailing slash). Returns null if invalid. */
export function normalizeLegacyOrigin(url: string | null | undefined): string | null {
  const raw = url?.trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

/** Legacy PHP base URL: session origin, else SRS_PUBLIC_URL env fallback. */
export function resolveLegacyPublicUrl(
  legacyOrigin: string | null | undefined,
): string {
  const fromSession = normalizeLegacyOrigin(legacyOrigin)
  if (fromSession) return fromSession

  const fallback = process.env.SRS_PUBLIC_URL?.trim() || 'http://srs.com'
  return fallback.replace(/\/$/, '')
}

/** Browser must hit Legacy logout.php so main/mooi cookies are cleared (host-only). */
export function buildLegacyLogoutUrl(
  legacyOrigin: string | null | undefined,
  v0LoginUrl: string,
): URL {
  const logout = new URL('/logout.php', `${resolveLegacyPublicUrl(legacyOrigin)}/`)
  logout.searchParams.set('next', v0LoginUrl)
  return logout
}
