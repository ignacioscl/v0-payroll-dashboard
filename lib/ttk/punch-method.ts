/** How a single punch event was captured (mirrors `app.ttk_main_helper.js`). */
export type PunchEventMethod = 'finger' | 'face' | null

export const PUNCH_METHOD_LABELS: Record<Exclude<PunchEventMethod, null>, string> = {
  finger: 'Finger',
  face: 'Face',
}

/** Finger wins over face when both IDs exist (legacy ttk_main rule). */
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

export type TtkPunchValidationFields = {
  idPunchInLogValidation?: number | string | null
  idBreakStartLogValidation?: number | string | null
  idBreakEndLogValidation?: number | string | null
  idPunchOutLogValidation?: number | string | null
  idPunchInLogFingerValidation?: number | string | null
  idBreakStartLogFingerValidation?: number | string | null
  idBreakEndLogFingerValidation?: number | string | null
  idPunchOutLogFingerValidation?: number | string | null
}

export function punchInMethod(row: TtkPunchValidationFields): PunchEventMethod {
  return resolvePunchEventMethod(
    row.idPunchInLogFingerValidation,
    row.idPunchInLogValidation,
  )
}

export function breakStartMethod(row: TtkPunchValidationFields): PunchEventMethod {
  return resolvePunchEventMethod(
    row.idBreakStartLogFingerValidation,
    row.idBreakStartLogValidation,
  )
}

export function breakEndMethod(row: TtkPunchValidationFields): PunchEventMethod {
  return resolvePunchEventMethod(
    row.idBreakEndLogFingerValidation,
    row.idBreakEndLogValidation,
  )
}

export function punchOutMethod(row: TtkPunchValidationFields): PunchEventMethod {
  return resolvePunchEventMethod(
    row.idPunchOutLogFingerValidation,
    row.idPunchOutLogValidation,
  )
}

/** Any face-validation log id set (legacy “Face recognition photos” button). */
export function hasFaceValidationPhotos(row: TtkPunchValidationFields): boolean {
  return [
    row.idPunchInLogValidation,
    row.idBreakStartLogValidation,
    row.idBreakEndLogValidation,
    row.idPunchOutLogValidation,
  ].some((id) => id != null && id !== '' && Number(id) > 0)
}

export function formatMethodForExport(method: PunchEventMethod): string {
  if (!method) return ''
  return ` (${PUNCH_METHOD_LABELS[method]})`
}
