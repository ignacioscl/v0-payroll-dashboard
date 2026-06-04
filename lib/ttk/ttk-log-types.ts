export type TtkPunchLogEntry = {
  id?: number | string
  dateUpdate?: string | null
  usuario?: { id?: number | string; nombre?: string } | null
  punchInGmt0?: string | null
  punchInOldGmt0?: string | null
  punchInNote?: string | null
  breakStartGmt0?: string | null
  breakStartOldGmt0?: string | null
  breakStartNote?: string | null
  breakEndGmt0?: string | null
  breakEndOldGmt0?: string | null
  breakEndNote?: string | null
  punchOutGmt0?: string | null
  punchOutOldGmt0?: string | null
  punchOutNote?: string | null
  hourlyRate?: string | number | null
  hourlyRateOld?: string | number | null
  paymentType?: { name?: string } | null
  paymentTypeOld?: { name?: string } | null
  note?: string | null
  fileLog?: string | null
  updateStatusTo?: number | null
  /** Set by API when payment fields were redacted (no perm 130/105/136). */
  paymentDetailsRestricted?: boolean
}

export type TtkPunchLogResponse = {
  data?: TtkPunchLogEntry[]
  status?: string
  error?: { message?: string }
}
