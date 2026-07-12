export type PunchGroupedPaymentTypeRow = {
  idPaymentType: number | null
  label: string
  hoursNumber: number
}

export type PunchGroupedRow = {
  idUsuario: number
  nombreEmployee: string
  hoursNumber: number
  breakNumber: number
  hasError: boolean
  byPaymentType: PunchGroupedPaymentTypeRow[]
}

export type PunchGroupedResponse = {
  results: PunchGroupedRow[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}
