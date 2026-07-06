'use client'

import { useInfiniteQuery } from '@tanstack/react-query'

import {
  fetchInvoiceList,
  type InvoiceListParams,
  type InvoiceListResponse,
} from '@/lib/srs-invoices-api'

export type InvoiceListInput = Omit<InvoiceListParams, 'page' | 'pageSize'>

/**
 * Listado de invoices con scroll infinito. Cada “página” trae `pageSize` filas
 * (25 / 50 / 100 / all). `enabled` se apaga cuando falta dealer/fechas.
 */
export function useInvoiceList(input: InvoiceListInput | null, pageSize: number) {
  return useInfiniteQuery<InvoiceListResponse>({
    queryKey: ['srs-invoices', input, pageSize],
    queryFn: ({ pageParam }) =>
      fetchInvoiceList({
        ...(input as InvoiceListInput),
        page: pageParam as number,
        pageSize,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: input !== null,
  })
}
