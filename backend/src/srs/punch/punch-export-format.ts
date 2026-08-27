export type PunchExportLocale = 'en' | 'es'
export type PunchEventMethod = 'finger' | 'face' | null

const NY = 'America/New_York'

function nyPeriod(raw?: string): 'AM' | 'PM' {
  const n = (raw ?? '').replace(/\./g, '').replace(/\s/g, '').toUpperCase()
  return n.startsWith('P') ? 'PM' : 'AM'
}

function nyParts(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: NY, ...options }).formatToParts(date)
  const out: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = p.value
  }
  return out
}

export function formatNyDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = nyParts(d, { month: '2-digit', day: '2-digit', year: 'numeric' })
  return `${p.month}/${p.day}/${p.year}`
}

export function formatNyTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = nyParts(d, { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${p.hour}:${p.minute} ${nyPeriod(p.dayPeriod)}`
}

export function formatNyStamp(date: Date = new Date()): string {
  const p = nyParts(date, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${p.month}/${p.day}/${p.year} ${p.hour}:${p.minute} ${nyPeriod(p.dayPeriod)} ET`
}

export function buildPunchExportFilename(date: Date = new Date()): string {
  const p = nyParts(date, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const hour = String(p.hour).padStart(2, '0')
  const period = nyPeriod(p.dayPeriod)
  return `punch_export_${p.month}-${p.day}-${p.year}_${hour}-${p.minute}_${period}.xlsx`
}

export function formatDurationHhMmSs(value?: string | null): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\.\d+$/, '')
}

export function resolvePunchEventMethod(
  fingerId?: number | string | null,
  faceId?: number | string | null,
): PunchEventMethod {
  const finger = fingerId != null && fingerId !== '' && Number(fingerId) > 0
  const face = faceId != null && faceId !== '' && Number(faceId) > 0
  if (finger) return 'finger'
  if (face) return 'face'
  return null
}

export function formatPunchMethodSuffix(
  method: PunchEventMethod,
  locale: PunchExportLocale,
): string {
  if (!method) return ''
  if (locale === 'es') {
    return method === 'finger' ? ' (Huella)' : ' (Rostro)'
  }
  return method === 'finger' ? ' (Finger)' : ' (Face)'
}

export function punchExportSheetName(sheetIndex: number, _locale: PunchExportLocale): string {
  return sheetIndex <= 1 ? 'Punch Report' : `Punch Report ${sheetIndex}`
}

export function contentDispositionAttachment(filename: string): string {
  const quoted = `"${filename.replace(/"/g, '')}"`
  return `attachment; filename=${quoted}; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
