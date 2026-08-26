'use client'

import { useQuery } from '@tanstack/react-query'

import {
  fetchInvoiceSummary,
  type InvoiceSummaryResponse,
} from '@/lib/srs-invoices-api'
import type { InvoiceListInput } from '@/hooks/use-invoice-list'

export function useInvoiceSummary(input: InvoiceListInput | null) {
  return useQuery<InvoiceSummaryResponse>({
    queryKey: ['srs-invoices-summary', input],
    queryFn: () => fetchInvoiceSummary(input as InvoiceListInput),
    enabled: input !== null,
  })
}
