'use client'

import { useQuery } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoiceStatementLogEntry = {
  descCambio?: string
  descJson?: string | Record<string, unknown>
  fecha?: string
  origen?: string
  age?: string
  autor?: { nombre?: string }
}

export function invoiceStatementLogQueryKey(id: number | null) {
  return ['invoice-statement-log', id] as const
}

export function useInvoiceStatementLog(id: number | null, enabled: boolean) {
  const apiRequest = useSrsApiRequest<
    undefined,
    { id_invoice_statement: number },
    InvoiceStatementLogEntry[]
  >(SrsPhpPath.INVOICE_STATEMENT_LOG)

  return useQuery<InvoiceStatementLogEntry[]>({
    queryKey: invoiceStatementLogQueryKey(id),
    enabled: enabled && id != null && id > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {
        id_invoice_statement: id!,
      })
      return assertSrsSuccess<InvoiceStatementLogEntry[]>(
        raw,
        'Failed to load invoice log',
      )
    },
  })
}
