/**
 * El histórico de una expense Piecework (T5b de plan-reunion-juan-18-11, migration 034): el Nest guarda el motivo como
 * código (`reason`) y todos los motivos con sus valores en `detail` (`code` o `code:antes>después`, separados por `|`,
 * `encodeReasons` del back). Esto los vuelve texto en el idioma del usuario.
 */
import { fmtAmount, fmtYmd } from '@/lib/expenses/expense-format'

export const PIECEWORK_REASON_CODES = [
  'wo_deleted',
  'wo_active_again',
  'service_removed',
  'service_added',
  'vendor_removed',
  'vendor_added',
  'service_piecework',
  'vendor_piecework',
  'service_price',
  'employee_count',
  'dealer',
  'date',
  'moved_out',
  'moved_frozen',
  'calc',
  'edit_added',
  'edit_removed',
] as const

export type PieceworkReasonCode = (typeof PIECEWORK_REASON_CODES)[number]

export interface DecodedReason {
  code: PieceworkReasonCode
  from?: string
  to?: string
}

const isCode = (c: string): c is PieceworkReasonCode => (PIECEWORK_REASON_CODES as readonly string[]).includes(c)

/** `detail` → motivos. Un código que la pantalla no conoce se descarta; sin `detail`, el `reason` solo. */
export function decodeReasons(detail: string | null | undefined, reason: string): DecodedReason[] {
  const parts = (detail ?? '').split('|').map((p) => p.trim()).filter(Boolean)
  const out: DecodedReason[] = []
  for (const p of parts) {
    const [code, values] = p.split(':', 2) as [string, string | undefined]
    if (!isCode(code)) continue
    if (values === undefined) {
      out.push({ code })
      continue
    }
    const [from, to] = values.split('>', 2)
    out.push({ code, from: from ?? '', to: to ?? '' })
  }
  if (!out.length && isCode(reason)) out.push({ code: reason })
  return out
}

const DATE_CODES = new Set<PieceworkReasonCode>(['date', 'moved_out', 'moved_frozen'])
const AMOUNT_CODES = new Set<PieceworkReasonCode>(['service_piecework', 'vendor_piecework', 'service_price'])

/** Los valores listos para el texto: fechas `MM/DD/YYYY`, montos con `$`, cantidades tal cual. */
export function reasonParams(r: DecodedReason): Record<string, string> {
  const fmt = (v: string | undefined) => {
    if (v === undefined || v === '' || v === '-') return '—'
    if (DATE_CODES.has(r.code)) return fmtYmd(v)
    if (AMOUNT_CODES.has(r.code)) return fmtAmount(v)
    return v
  }
  return { from: fmt(r.from), to: fmt(r.to) }
}

/** El texto de cada motivo (`t` = el traductor de la pantalla). */
export function reasonTexts(
  detail: string | null | undefined,
  reason: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string[] {
  return decodeReasons(detail, reason).map((r) => t(`expenses.pieceworkReasons.${r.code}`, reasonParams(r)))
}
