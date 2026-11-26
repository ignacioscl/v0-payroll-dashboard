import type { WoToBeBilledRow, WoServiceDetail } from '@/lib/srs-wo-to-be-billed-api'
import { WO_STATUS_COMPLETED } from '@/lib/srs-wo-to-be-billed-api'

/**
 * Cómo legacy dibuja las celdas de la solapa (plans/plan-wo-to-be-billed-v0, T9), en funciones puras con su test.
 */

/** Age: `HH:MM` de `CARFLOW_GET_WORKED_TIME_BY_WO` pasado a días, horas y minutos (`Invoice::getParseTime`). */
export type WoAgeParts = { day: number; hour: number; minute: number }

export function woAgeParts(timeWorked: string | null): WoAgeParts | null {
  if (!timeWorked || !timeWorked.includes(':')) return null
  const [h, m] = timeWorked.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const total = hours * 3600 + minutes * 60
  return {
    day: Math.floor(total / 86400),
    hour: Math.floor((total % 86400) / 3600),
    minute: Math.floor((total % 3600) / 60),
  }
}

/**
 * El texto de Age de legacy (`parseDiffDate2Screen`, `app.commons.js:1202-1220`): «1D 2H 3M», o «N Minutes» si solo hay
 * minutos, o «Now»; vacío si es «Now» y la WO está Completed (`app.binvoice_main_table.js:286-297`).
 */
export function formatWoAge(
  timeWorked: string | null,
  idWorkflow: number,
  texts: { minutes: (n: number) => string; minute: string; now: string },
): string {
  const parts = woAgeParts(timeWorked)
  const out: string[] = []
  if (parts?.day) out.push(`${parts.day}D`)
  if (parts?.hour) out.push(`${parts.hour}H`)
  if (parts?.minute) {
    if (out.length) out.push(`${parts.minute}M`)
    else out.push(parts.minute === 1 ? texts.minute : texts.minutes(parts.minute))
  }
  if (out.length) return out.join(' ')
  return idWorkflow === WO_STATUS_COMPLETED ? '' : texts.now
}

/**
 * Services: los nombres, con los pendientes en negrita **solo si la WO tiene otro servicio ya facturado**
 * (`serviceColumnV2`, `app.invoice_global.js:113-133`).
 */
export function woServicesDisplay(services: WoServiceDetail[]): Array<{ name: string; pending: boolean }> {
  const someInvoiced = services.some((s) => s.idStatement != null)
  return services.map((s) => ({
    name: String(s.nombre ?? ''),
    pending: someInvoiced && s.idStatement == null,
  }))
}

export type WoApprovedDisplay =
  | { kind: 'none' }
  | { kind: 'notApproved'; note: string }
  | { kind: 'approved'; approver: string; date: string | null }
  | {
      kind: 'car'
      color: 'gray' | 'red' | 'green'
      approver: string | null
      approvedDate: string | null
      inspector: string | null
      inspectedDate: string | null
      internalInspector: string | null
      internalInspectedDate: string | null
    }

/**
 * La columna Approved de legacy (`approbeColumn`, `app.invoice_global.js:157-259`), sin el clic (en esta solapa no
 * hace nada): cruz roja, tilde verde o el auto de la inspección con su color.
 */
export function woApprovedDisplay(row: WoToBeBilledRow): WoApprovedDisplay {
  const completed = row.idWorkflow === WO_STATUS_COMPLETED
  const anyInspect = row.hasFinalInspect || row.hasInternalInspect
  if (row.approved === 0) return { kind: 'notApproved', note: row.unapproveNote ?? '' }
  if (row.approved === 1) {
    const approved = { kind: 'approved' as const, approver: row.approverName ?? '', date: row.approvedDate }
    if (!anyInspect || !completed) return approved
    if (row.inspected == null && row.internalInspected == null) return approved
  }
  if ((row.approved == null || row.approved === 1) && anyInspect && completed) {
    if (row.inspected != null || row.internalInspected != null) {
      let color: 'gray' | 'red' | 'green'
      const internal = row.internalInspected
      if (row.inspected == null) color = internal === -1 ? 'gray' : internal === 0 ? 'red' : 'green'
      else if (internal === -1) color = 'gray'
      else if (internal === 0) color = 'red'
      else color = row.inspected === -1 ? 'gray' : row.inspected === 0 ? 'red' : 'green'
      return {
        kind: 'car',
        color,
        approver: row.approved != null ? (row.approverName ?? '') : null,
        approvedDate: row.approved != null ? row.approvedDate : null,
        inspector: row.inspected === 1 || row.inspected === 0 ? (row.inspectorName ?? '') : null,
        inspectedDate: row.inspected === 1 || row.inspected === 0 ? row.inspectedDate : null,
        internalInspector:
          row.internalInspected === 1 || row.internalInspected === 0 ? (row.internalInspectorName ?? '') : null,
        internalInspectedDate:
          row.internalInspected === 1 || row.internalInspected === 0 ? row.internalInspectedDate : null,
      }
    }
  }
  return { kind: 'none' }
}

/**
 * `YYYY-MM-DD HH:MM:SS` → `MM/DD/YYYY hh:mm AM/PM`, como `getFechaScreen()` + `amPm()` de legacy
 * (`public/js/app.commons.js:1034-1117`) para las marcas de aprobación e inspección del tooltip (R17 de CODE-review.md).
 * Igual que legacy: de 12 en adelante resta 12 y pone PM (00 → 12); antes, la hora tal cual y AM (medianoche: «00:00 AM»).
 * Sin hora, solo la fecha.
 */
export function woUsDateTime(value: string | null): string {
  if (!value) return ''
  const date = woUsDate(value)
  const m = /^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/.exec(value)
  if (!m) return date
  const hour = Number(m[1])
  if (hour > 11) {
    const h = hour - 12
    return `${date} ${h === 0 ? '12' : String(h).padStart(2, '0')}:${m[2]} PM`
  }
  return `${date} ${m[1]}:${m[2]} AM`
}

/** `YYYY-MM-DD HH:MM:SS` de la base → `MM/DD/YYYY` (sin convertir zona, como la muestra legacy). */
export function woUsDate(value: string | null): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : value
}
