/** Platform title when no provider context is available (e.g. login page). */
export const SRS_SUITE_TITLE = 'SRS Suite Pro'
export const APP_SUBTITLE = 'SRS Suite Pro'

export interface BrandingUser {
  /** Usuario::getCompany() / contratistaOwner — contratista.razon_social */
  providerName?: string | null
}

/** Sidebar title: provider name from DB, otherwise SRS Suite Pro. */
export function getAppTitle(user: BrandingUser | null | undefined): string {
  const name = user?.providerName?.trim()
  if (name) return name
  return SRS_SUITE_TITLE
}
