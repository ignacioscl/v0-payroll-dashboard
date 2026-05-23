export type TtkListRow = {
  id: number | string
  punchIn?: string | null
  punchInGmt0?: string | null
  punchOut?: string | null
  punchOutGmt0?: string | null
  breakStart?: string | null
  breakStartGmt0?: string | null
  breakEnd?: string | null
  breakEndGmt0?: string | null
  timeWork?: string | null
  timeBreak?: string | null
  numberWork?: number | null
  numberBrake?: number | null
  estado?: number
  usuario?: { nombre?: string }
  rolDpto?: { role?: string; department?: string } | null
  dealer?: { id?: number; razonSocial?: string }
  dealerProvider?: { id?: number }
}

export type TtkListResponse = {
  draw?: string | number
  recordsTotal?: string | number
  recordsFiltered?: string | number
  data?: TtkListRow[]
  status?: string
  error?: { message?: string }
}

export type TtkListQueryParams = {
  start: number
  length: number
  draw: number
  search: string
  id_dealer: string
  fecha_desde: string
  fecha_hasta: string
  order_by: string
  only_error?: number
  only_error_clockout?: number
  without_salary?: number
  manual_punch?: number
  only_deletes?: number
  show_deleted?: number
  filter_logic_or?: number
}
