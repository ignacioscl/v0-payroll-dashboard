'use client'

import { useQuery } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoiceStatementEmailLogEntry = {
  author?: string
  email?: string
  fecha?: string | null
  readedDate?: string | null
}

export function invoiceStatementEmailLogQueryKey(id: number | null) {
  return ['invoice-statement-email-log', id] as const
}

export function useInvoiceStatementEmailLog(id: number | null, enabled: boolean) {
  const apiRequest = useSrsApiRequest<
    undefined,
    { id_invoice_statement: number },
    InvoiceStatementEmailLogEntry[]
  >(SrsPhpPath.INVOICE_STATEMENT_EMAIL_LOG)

  return useQuery({
    queryKey: invoiceStatementEmailLogQueryKey(id),
    enabled: enabled && id != null && id > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {
        id_invoice_statement: id!,
      })
      return assertSrsSuccess<InvoiceStatementEmailLogEntry[]>(
        raw,
        'Failed to load sent email log',
      )
    },
  })
}
