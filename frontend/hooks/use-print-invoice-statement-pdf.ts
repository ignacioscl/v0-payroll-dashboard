'use client'

import { useMutation } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import {
  assertPdfOrZipBlob,
  downloadBlob,
  openPdfBlobInNewTab,
} from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoicePrintReportType = '-1' | '1' | '2' | '3' | '4' | '5'
export type InvoicePrintOrderBy = '1' | '2'

export type InvoicePrintColumnsVisibility = {
  ro: 0 | 1
  po: 0 | 1
  tag: 0 | 1
  noteService: 0 | 1
}

export type PrintInvoicePdfPayload = {
  ids_invoices: string
  payed?: string
  report_type?: InvoicePrintReportType
  order_by?: InvoicePrintOrderBy | ''
  columns_visibility?: InvoicePrintColumnsVisibility
  attach_time_card?: boolean
  separate_invoices_zip?: boolean
}

export function usePrintInvoiceStatementPdf() {
  const apiRequest = useSrsApiRequest<
    Record<string, string>,
    undefined,
    unknown
  >(SrsPhpPath.INVOICE_STATEMENT_PDF)

  return useMutation({
    mutationFn: async (payload: PrintInvoicePdfPayload) => {
      const reportType = payload.report_type ?? '-1'
      const cols = payload.columns_visibility
      const blob = await apiRequest.postBlob({
        ids_invoices: payload.ids_invoices,
        report_type: reportType,
        payed: payload.payed ?? '',
        order_by: payload.order_by ?? '',
        columns_visibility: cols ? JSON.stringify(cols) : '',
        attach_time_card: payload.attach_time_card ? '1' : '0',
        separate_invoices_zip: payload.separate_invoices_zip ? '1' : '',
      })
      const result = await assertPdfOrZipBlob(blob, 'Failed to generate invoice PDF')
      const stamp = new Date().toISOString().slice(0, 10)
      if (result.kind === 'zip') {
        downloadBlob(result.blob, `invoices_${stamp}.zip`)
      } else {
        openPdfBlobInNewTab(result.blob, `invoices_${stamp}.pdf`)
      }
    },
  })
}
