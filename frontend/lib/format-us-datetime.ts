/**
 * US locale formatting for Excel/CSV exports (MM/dd/yyyy + 12h am/pm).
 */

/**
 * Fecha de CALENDARIO (`yyyy-MM-dd`) → `MM/DD/YYYY`, sin construir `Date`.
 *
 * No usar `formatUsDateForExport` para esto: hace `new Date(value)`, y un
 * `yyyy-MM-dd` sin hora se parsea como medianoche **UTC**, así que
 * `toLocaleDateString` en UTC−3 devuelve el día anterior (`2026-08-31` →
 * `08/30/2026`) y el archivo declara un período falso.
 *
 * `formatUsDateForExport` queda para timestamps con hora, que es donde se usa.
 */
export function formatUsCalendarDate(ymd?: string | null): string {
  if (!ymd) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return ymd
  const [, y, mo, d] = m
  return `${mo}/${d}/${y}`
}

/** Igual pero para nombres de archivo: `MM-DD-YYYY` (sin barras). */
export function formatUsCalendarDateForFilename(ymd?: string | null): string {
  return formatUsCalendarDate(ymd).replace(/\//g, '-')
}

/** Hoy en `MM-DD-YYYY`, con la fecha LOCAL (no UTC). */
export function todayUsForFilename(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${mm}-${dd}-${now.getFullYear()}`
}

/** Date only — e.g. `05/28/2026` */
export function formatUsDateForExport(value?: string | null): string {
  if (!value) return ''
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

/** Date + time — e.g. `05/28/2026, 4:17 PM` */
export function formatUsDateTimeForExport(value?: string | null): string {
  if (!value) return ''
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatUsTimeForExport(value?: string | null): string {
  if (!value) return ''
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}
