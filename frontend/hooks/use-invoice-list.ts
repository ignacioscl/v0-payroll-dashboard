'use client'

import { useInfiniteQuery } from '@tanstack/react-query'

import {
  fetchInvoiceList,
  type InvoiceListParams,
  type InvoiceListResponse,
} from '@/lib/srs-invoices-api'

export type InvoiceListInput = Omit<InvoiceListParams, 'page'>

/**
 * Listado de invoices con scroll infinito (páginas server-side de INVOICE_PAGE_SIZE).
 * `enabled` se apaga cuando falta dealer/fechas para no pegarle al backend.
 */
export function useInvoiceList(input: InvoiceListInput | null) {
  return useInfiniteQuery<InvoiceListResponse>({
    queryKey: ['srs-invoices', input],
    queryFn: ({ pageParam }) =>
      fetchInvoiceList({ ...(input as InvoiceListInput), page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: input !== null,
  })
}
