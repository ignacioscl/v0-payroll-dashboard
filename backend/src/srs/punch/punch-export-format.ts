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

/**
 * Fecha+hora de un DATETIME de la base ('YYYY-MM-DD HH:mm:ss'), en el formato del
 * export. Nunca volcar el string crudo a una celda: sale `2026-09-06 17:37:12` en
 * una planilla donde todo lo demás es `09/06/2026`.
 *
 * NO convierte de zona horaria, a diferencia de formatNyDate/Time. Esos reciben
 * un ISO en GMT-0 (`punchInGmt0`) y lo pasan a NY; un DATETIME pelado como
 * `fixed_at` no tiene zona, así que convertirlo le corre la hora contra nada.
 * Se reformatean los componentes tal como los guardó la base.
 */
export function formatDbStampForExport(value?: string | null): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value)
  if (!m) return ''
  const [, year, month, day, hh, mm] = m
  const hour24 = Number(hh)
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  // Con coma, igual que formatUsDateTimeForExport del front: los dos exports
  // muestran la misma celda y no se pueden distinguir a ojo.
  return `${month}/${day}/${year}, ${hour12}:${mm} ${period}`
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

/**
 * Nombre del export del ranking de dealers del Dashboard. Mismo formato que
 * `buildPunchExportFilename` (hora de NY, guiones en vez de barras y dos puntos),
 * con otro prefijo.
 */
export function buildDealerRankingExportFilename(date: Date = new Date()): string {
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
  return `dealers_ranking_${p.month}-${p.day}-${p.year}_${hour}-${p.minute}_${period}.xlsx`
}

/**
 * `YYYY-MM-DD` → `MM/DD/YYYY`, por los componentes y sin pasar por `Date`: un
 * `new Date('2026-08-27')` es medianoche UTC y en NY cae el día anterior. Si no
 * matchea, devuelve el valor tal cual.
 *
 * Vivía privada en punch-export.service.ts; se movió acá para que el export del
 * ranking arme el período y la fecha del aviso con el mismo helper.
 */
export function ymdToUs(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (!m) return ymd
  return `${m[2]}/${m[3]}/${m[1]}`
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
