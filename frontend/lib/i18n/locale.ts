export type AppLocale = 'en' | 'es'

export function resolveLocale(user?: {
  locale?: string | null
  navTemplate?: number | null
} | null): AppLocale {
  if (user?.locale === 'es' || user?.locale === 'en') {
    return user.locale
  }
  if (user?.navTemplate === 2) {
    return 'es'
  }
  return 'en'
}
