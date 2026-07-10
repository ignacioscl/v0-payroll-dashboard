'use client'

import { useMutation } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import {
  assertPdfBlob,
  assertSrsSuccess,
  openPdfBlobInNewTab,
} from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type PrintInvoicePdfPayload = {
  ids_invoices: string
  payed?: string
}

export function usePrintInvoiceStatementPdf() {
  const apiRequest = useSrsApiRequest<
    PrintInvoicePdfPayload,
    undefined,
    unknown
  >(SrsPhpPath.INVOICE_STATEMENT_PDF)

  return useMutation({
    mutationFn: async (payload: PrintInvoicePdfPayload) => {
      const blob = await apiRequest.postBlob({
        ids_invoices: payload.ids_invoices,
        report_type: '-1',
        payed: payload.payed ?? '',
        order_by: '',
        columns_visibility: '',
      })
      const pdf = await assertPdfBlob(blob, 'Failed to generate invoice PDF')
      openPdfBlobInNewTab(pdf)
    },
  })
}
