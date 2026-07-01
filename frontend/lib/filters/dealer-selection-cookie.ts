export const PAYROLL_SELECTED_DEALERS_COOKIE = 'payroll_selected_dealers'

const MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30 days

function parseCookieValue(raw: string): string[] {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
  } catch {
    return []
  }
}

/** Read persisted dealer IDs from the browser cookie (client only). */
export function readSelectedDealersCookie(): string[] {
  if (typeof document === 'undefined') return []

  const prefix = `${PAYROLL_SELECTED_DEALERS_COOKIE}=`
  const entry = document.cookie.split('; ').find((row) => row.startsWith(prefix))
  if (!entry) return []

  return parseCookieValue(entry.slice(prefix.length))
}

/** Persist dealer selection; clears the cookie when the list is empty. */
export function writeSelectedDealersCookie(ids: string[]): void {
  if (typeof document === 'undefined') return

  if (ids.length === 0) {
    document.cookie = `${PAYROLL_SELECTED_DEALERS_COOKIE}=; path=/; max-age=0; SameSite=Lax`
    return
  }

  const value = encodeURIComponent(JSON.stringify(ids))
  document.cookie = `${PAYROLL_SELECTED_DEALERS_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`
}
