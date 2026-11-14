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

/**
 * Orígenes del legacy permitidos (`SRS_LEGACY_ORIGINS`, separados por coma; plans/plan-buenas-practicas-v0, 3.13). Hoy
 * PROD: main y mooi. Los usa también la CSP (`form-action` de next.config.mjs), porque el logout y la vuelta al legacy
 * salen por un form POST que redirige ahí.
 */
export function allowedLegacyOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.SRS_LEGACY_ORIGINS ?? '')
    .split(',')
    .map((o) => normalizeLegacyOrigin(o))
    .filter((o): o is string => o !== null)
}

/**
 * Legacy PHP base URL: the session origin only if it is one of SRS_LEGACY_ORIGINS (the cookie is unsigned: the user
 * could point the logout and the SSO code anywhere), else SRS_PUBLIC_URL.
 */
export function resolveLegacyPublicUrl(
  legacyOrigin: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromSession = normalizeLegacyOrigin(legacyOrigin)
  if (fromSession && allowedLegacyOrigins(env).includes(fromSession)) return fromSession

  const fallback = env.SRS_PUBLIC_URL?.trim() || 'http://srs.com'
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
