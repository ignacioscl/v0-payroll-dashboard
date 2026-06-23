export type TtkPaymentTypeOption = {
  id: number
  paymentTypeName: string
  price?: number | null
  isDefault?: number
}

export type TtkPaymentTypesResponse = {
  data?: TtkPaymentTypeOption[]
  status?: string
  error?: { message?: string }
}

export type TtkSavePaymentPayload = {
  id_ttk: number
  payment_type: number
  hourly_rate: number
  note?: string | null
}

export type TtkSavePaymentResponse = {
  data?: {
    id: number
    objPaymentType?: { id?: number; name?: string } | null
    hourlyRate?: number | null
  }
  status?: string
  error?: { message?: string }
}
