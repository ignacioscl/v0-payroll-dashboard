/** Toolbar payment type filter values for ttk-list. */
export type PaymentTypeFilterValue = 'all' | 'without' | number

export const PAYMENT_TYPE_FILTER_ALL = 'all'
export const PAYMENT_TYPE_FILTER_WITHOUT = 'without'

export type PaymentTypeCatalogItem = {
  id: number
  name: string
  title?: string
}

export type PaymentTypesCatalogResponse = {
  data?: PaymentTypeCatalogItem[]
  status?: string
  error?: { message?: string }
}
