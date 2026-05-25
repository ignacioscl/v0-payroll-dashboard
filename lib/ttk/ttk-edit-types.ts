/** Detail of a single TTK punch (response of ttk-get-by-id.php). */
export type TtkPunchDetail = {
  id: number | string
  punchInGmt0?: string | null
  punchOutGmt0?: string | null
  breakStartGmt0?: string | null
  breakEndGmt0?: string | null
  punchInNote?: string | null
  punchOutNote?: string | null
  breakStartNote?: string | null
  breakEndNote?: string | null
  timeWork?: string | null
  timeBreak?: string | null
  usuario?: { id?: number | string; nombre?: string } | null
  dealer?: { id?: number | string; razonSocial?: string } | null
}

export type TtkPunchDetailResponse = {
  data?: TtkPunchDetail
  status?: string
  error?: { message?: string }
}

/** Payload sent to ttk-edit.php. */
export type TtkEditPunchPayload = {
  id_ttk: number | string
  punch_in: string | null
  punch_in_tz: string | null
  break_start: string | null
  break_start_tz: string | null
  break_end: string | null
  break_end_tz: string | null
  punch_out: string | null
  punch_out_tz: string | null
  punch_in_note?: string | null
  break_start_note?: string | null
  break_end_note?: string | null
  punch_out_note?: string | null
  file_log?: string | null
}

export type TtkEditPunchResponse = {
  data?: {
    id: number | string
    punchInGmt0?: string | null
    punchOutGmt0?: string | null
    breakStartGmt0?: string | null
    breakEndGmt0?: string | null
    timeWork?: string | null
    timeBreak?: string | null
    usuario?: { id?: number | string; nombre?: string } | null
  }
  status?: string
  error?: { message?: string }
}
