import { parseISO } from 'date-fns'
import type { AppLocale } from '@/lib/i18n/locale'

const ES_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const

/** Eje X mensual: "Jun 26" / "Ago 26" (no yyyy-mm-dd). */
export function formatMonthBucketLabel(monthStart: string, locale: AppLocale): string {
  const date = parseISO(monthStart)
  const year = String(date.getFullYear()).slice(-2)
  if (locale === 'es') {
    return `${ES_MONTHS[date.getMonth()]} ${year}`
  }
  const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
  return `${enMonths[date.getMonth()]} ${year}`
}
