import { PunchListRowDto } from '../dto/punch-list.dto'
import { epochToIso } from './punch-list-epoch'

function parseJson<T>(raw: unknown): T | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object') return raw as T
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return null
  }
}

function toNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function toStringOrNull(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  return String(raw)
}

export type PunchListRowFlags = {
  includeAmounts: boolean
  includePaymentTypeName: boolean
  /**
   * `interno && lista blanca parcial`. Con lista default la fila queda
   * byte-idéntica a la de hoy (ni aparece la clave), y a un usuario externo
   * —que no puede filtrar por tipo de error— nunca se le serializa el código.
   */
  includeErrorType?: boolean
}

/** Mapea la fila cruda a la forma que ya consume el frontend (`TtkListRow`). */
export function mapPunchListRow(
  r: Record<string, unknown>,
  flags: PunchListRowFlags,
): PunchListRowDto {
  const rolDpto = parseJson<{ department?: string; role?: string }>(r.rol_dpto)
  const badPunch = parseJson<{ res?: string }>(r.bad_punch)
  const idPaymentType = toNumberOrNull(r.id_payment_type)
  const fixedById = toNumberOrNull(r.fixed_by)

  const row: PunchListRowDto = {
    id: Number(r.id),

    punchInGmt0: epochToIso(r.punch_in_epoch),
    punchOutGmt0: epochToIso(r.punch_out_epoch),
    breakStartGmt0: epochToIso(r.break_start_epoch),
    breakEndGmt0: epochToIso(r.break_end_epoch),

    timeWork: toStringOrNull(r.time_work) ?? toStringOrNull(r.total_time_work) ?? '00:00',
    timeBreak: toStringOrNull(r.time_break) ?? '00:00',
    numberWork: toNumberOrNull(r.number_work),
    numberBrake: toNumberOrNull(r.number_break),

    estado: Number(r.estado ?? 1),
    hasLog: Number(r.has_log) ? 1 : 0,
    manualCreate: Number(r.manual_create ?? 0),

    fixedAt: toStringOrNull(r.fixed_at),
    fixedBy:
      fixedById && fixedById > 0
        ? { id: fixedById, nombre: String(r.fixed_by_nombre ?? '') }
        : null,
    fixedErrorSnapshot: toStringOrNull(r.fixed_error_snapshot),

    usuario: {
      id: Number(r.id_usuario),
      nombre: String(r.nombre ?? ''),
      thumbnailUuid: toStringOrNull(r.thumbnail_uuid),
    },
    rolDpto: rolDpto ? { role: rolDpto.role ?? null, department: rolDpto.department ?? null } : null,
    dealer: { id: Number(r.id_dealer), razonSocial: String(r.razon_social ?? '') },
    badPunch: badPunch?.res ? { res: String(badPunch.res) } : null,
    objPaymentType: null,

    hourlyRate: null,
    typePayment: null,

    idPunchInLogValidation: toNumberOrNull(r.id_punch_in_log_validation),
    idBreakStartLogValidation: toNumberOrNull(r.id_break_start_log_validation),
    idBreakEndLogValidation: toNumberOrNull(r.id_break_end_log_validation),
    idPunchOutLogValidation: toNumberOrNull(r.id_punch_out_log_validation),
    idPunchInLogFingerValidation: toNumberOrNull(r.id_punch_in_log_finger_validation),
    idBreakStartLogFingerValidation: toNumberOrNull(r.id_break_start_log_finger_validation),
    idBreakEndLogFingerValidation: toNumberOrNull(r.id_break_end_log_finger_validation),
    idPunchOutLogFingerValidation: toNumberOrNull(r.id_punch_out_log_finger_validation),
  }

  if (flags.includePaymentTypeName) {
    row.objPaymentType =
      idPaymentType && idPaymentType > 0
        ? { id: idPaymentType, name: String(r.payment_type_name ?? '') }
        : null
  }

  if (flags.includeAmounts) {
    row.hourlyRate = toNumberOrNull(r.hourly_rate)
    row.typePayment = toNumberOrNull(r.type_payment)
  } else {
    delete (row as { hourlyRate?: unknown }).hourlyRate
    delete (row as { typePayment?: unknown }).typePayment
  }

  if (!flags.includePaymentTypeName) {
    delete (row as { objPaymentType?: unknown }).objPaymentType
  }

  if (flags.includeErrorType) {
    row.errorType = toNumberOrNull(r.error_type)
  }

  return row
}
