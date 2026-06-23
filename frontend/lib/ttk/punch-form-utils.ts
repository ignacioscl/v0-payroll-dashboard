import type { TranslateFn } from '@/lib/i18n/locale-context'
import { getPunchFieldLabels } from '@/lib/i18n/label-helpers'

export type PunchTimeKey = 'punchIn' | 'breakStart' | 'breakEnd' | 'punchOut'
export type PunchNoteKey = 'punchInNote' | 'breakStartNote' | 'breakEndNote' | 'punchOutNote'

export const PUNCH_FIELD_LABELS: Record<PunchTimeKey, string> = {
  punchIn: 'Clock In',
  breakStart: 'Break Start',
  breakEnd: 'Break End',
  punchOut: 'Clock Out',
}

export type PunchFormState = Record<PunchTimeKey, string> & Record<PunchNoteKey, string>

export const EMPTY_PUNCH_FORM: PunchFormState = {
  punchIn: '',
  breakStart: '',
  breakEnd: '',
  punchOut: '',
  punchInNote: '',
  breakStartNote: '',
  breakEndNote: '',
  punchOutNote: '',
}

/** ISO/GMT0 → "YYYY-MM-DDTHH:mm" (datetime-local input value). */
export function toDatetimeLocal(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  )
}

/** datetime-local string → ISO 8601 UTC, same as legacy formateDateTz(). */
export function toIsoTz(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function diffMinutes(from: string, to: string): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return (b - a) / 60_000
}

export function validatePunchForm(
  state: PunchFormState,
  t?: TranslateFn,
): {
  generalError: string | null
  fieldErrors: Partial<Record<PunchTimeKey, string>>
} {
  const errors: Partial<Record<PunchTimeKey, string>> = {}
  const required = t ? t('common.required') : 'Required'
  const mustBeAfterClockIn = t ? t('punch.mustBeAfterClockIn') : 'Must be after Clock In'
  const moreThan20Hours = t ? t('punch.moreThan20Hours') : 'More than 20 hours after Clock In'
  const mustBeBeforeClockOut = t ? t('punch.mustBeBeforeClockOut') : 'Must be before Clock Out'
  const breakStartRequiredWhenEnd = t
    ? t('punch.breakStartRequiredWhenEnd')
    : 'Break Start is required when Break End is set'
  const mustBeAfterBreakStart = t ? t('punch.mustBeAfterBreakStart') : 'Must be after Break Start'
  const clockInRequired = t ? t('punch.clockInRequired') : 'Clock in is required'
  const fieldLabels = t ? getPunchFieldLabels(t) : PUNCH_FIELD_LABELS

  if (!state.punchIn) {
    errors.punchIn = required
    return { generalError: clockInRequired, fieldErrors: errors }
  }

  if (state.punchOut) {
    const d = diffMinutes(state.punchIn, state.punchOut)
    if (d !== null) {
      if (d <= 0) errors.punchOut = mustBeAfterClockIn
      else if (d > 20 * 60) errors.punchOut = moreThan20Hours
    }
  }

  if (state.breakStart) {
    const d = diffMinutes(state.punchIn, state.breakStart)
    if (d !== null && d <= 0) errors.breakStart = mustBeAfterClockIn
    if (state.punchOut && !errors.punchOut) {
      const d2 = diffMinutes(state.breakStart, state.punchOut)
      if (d2 !== null && d2 <= 0) errors.breakStart = mustBeBeforeClockOut
    }
  }

  if (state.breakEnd) {
    if (!state.breakStart) {
      errors.breakEnd = breakStartRequiredWhenEnd
    } else {
      const d = diffMinutes(state.breakStart, state.breakEnd)
      if (d !== null && d <= 0) errors.breakEnd = mustBeAfterBreakStart
      if (state.punchOut && !errors.punchOut) {
        const d2 = diffMinutes(state.breakEnd, state.punchOut)
        if (d2 !== null && d2 <= 0) errors.breakEnd = mustBeBeforeClockOut
      }
    }
  }

  const firstField = (['punchIn', 'breakStart', 'breakEnd', 'punchOut'] as PunchTimeKey[]).find(
    (k) => errors[k],
  )
  const generalError = firstField
    ? `${fieldLabels[firstField]}: ${errors[firstField]}`
    : null

  return { generalError, fieldErrors: errors }
}

export function punchFormToEditPayload(
  id_ttk: number | string,
  form: PunchFormState,
): {
  id_ttk: number | string
  punch_in: string | null
  punch_in_tz: string | null
  break_start: string | null
  break_start_tz: string | null
  break_end: string | null
  break_end_tz: string | null
  punch_out: string | null
  punch_out_tz: string | null
  punch_in_note: string | null
  break_start_note: string | null
  break_end_note: string | null
  punch_out_note: string | null
} {
  return {
    id_ttk,
    punch_in: form.punchIn || null,
    punch_in_tz: toIsoTz(form.punchIn),
    break_start: form.breakStart || null,
    break_start_tz: toIsoTz(form.breakStart),
    break_end: form.breakEnd || null,
    break_end_tz: toIsoTz(form.breakEnd),
    punch_out: form.punchOut || null,
    punch_out_tz: toIsoTz(form.punchOut),
    punch_in_note: form.punchInNote || null,
    break_start_note: form.breakStartNote || null,
    break_end_note: form.breakEndNote || null,
    punch_out_note: form.punchOutNote || null,
  }
}

export function punchFormToAddPayload(
  id_employee: number,
  id_dealer: number,
  form: PunchFormState,
) {
  const { id_ttk: _omit, ...fields } = punchFormToEditPayload(0, form)
  return {
    id_employee,
    id_dealer,
    ...fields,
  }
}
