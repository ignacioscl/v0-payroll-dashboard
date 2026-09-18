export type TtkIssueCountByType = {
  clock_out_missing: number
  break_missing: number
  shift_20h_plus: number
  without_salary: number
  manual: number
  deleted: number
  payment_type_change: number
  fake_gps: number
}

export type TtkIssueCountBucket = {
  /**
   * Se conserva la clave `pending` aunque en `only_fixed` el dato no sea
   * "pendiente": es el nombre que ya usan los otros seis buckets y el front lo lee
   * posicionalmente.
   */
  pending: number
  by_type?: TtkIssueCountByType
  /**
   * Segunda cardinalidad, sólo en `only_fixed`: `pending` cuenta PONCHADAS
   * distintas con algún flag corregido (1–7).
   */
  punches?: number
  /**
   * Correcciones sobre ponchadas ya eliminadas, en PONCHADAS. Sólo en
   * `only_fixed`. Viaja siempre: en `0` cuando falta el permiso de eliminadas,
   * para que el shape sea uno solo y no quede un canal lateral.
   */
  on_deleted?: number
}

export type TtkFakeGpsBucket = {
  pending: number
  with_data: number
}

export type TtkIssueCountsData = {
  total_punches: number
  only_error: TtkIssueCountBucket
  only_flagged: TtkIssueCountBucket
  only_error_clockout: TtkIssueCountBucket
  only_error_break: TtkIssueCountBucket
  manual_punch: TtkIssueCountBucket
  without_salary: TtkIssueCountBucket
  fake_gps: TtkFakeGpsBucket
  only_deletes: TtkIssueCountBucket
  only_fixed: TtkIssueCountBucket
}

export type TtkIssueCountsResponse = {
  data?: { counts?: TtkIssueCountsData }
  counts?: TtkIssueCountsData
  status?: string
  error?: { message?: string }
}

export const EMPTY_BY_TYPE: TtkIssueCountByType = {
  clock_out_missing: 0,
  break_missing: 0,
  shift_20h_plus: 0,
  without_salary: 0,
  manual: 0,
  deleted: 0,
  payment_type_change: 0,
  fake_gps: 0,
}

export const EMPTY_TTK_ISSUE_COUNTS: TtkIssueCountsData = {
  total_punches: 0,
  only_error: { pending: 0, by_type: EMPTY_BY_TYPE },
  only_flagged: { pending: 0 },
  only_error_clockout: { pending: 0 },
  only_error_break: { pending: 0 },
  manual_punch: { pending: 0 },
  without_salary: { pending: 0 },
  fake_gps: { pending: 0, with_data: 0 },
  only_deletes: { pending: 0, by_type: EMPTY_BY_TYPE },
  only_fixed: { pending: 0, punches: 0, by_type: EMPTY_BY_TYPE, on_deleted: 0 },
}
