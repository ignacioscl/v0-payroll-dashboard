export const PAYROLL_SIDEBAR_COLLAPSED_KEY = 'payroll_sidebar_collapsed'

/** Default: collapsed. Returns saved preference when present. */
export function readSidebarCollapsedPreference(): boolean {
  if (typeof window === 'undefined') return true

  try {
    const raw = localStorage.getItem(PAYROLL_SIDEBAR_COLLAPSED_KEY)
    if (raw === null) return true
    return raw === '1' || raw === 'true'
  } catch {
    return true
  }
}

export function writeSidebarCollapsedPreference(collapsed: boolean): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(PAYROLL_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}
