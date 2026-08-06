'use client'

import { useMutation } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import {
  assertPdfOrZipBlob,
  openPdfBlobInNewTab,
} from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type GeneralStatementReportType = '' | '1' | '2'

export type PrintGeneralStatementPayload = {
  ids_invoices: string
  id_dealer: number
  report_type: GeneralStatementReportType
  fecha_desde?: string
  fecha_hasta?: string
  attach_time_card?: boolean
  exclude_zero?: boolean
  include_generic?: boolean
}

export function usePrintGeneralStatementPdf() {
  const apiRequest = useSrsApiRequest<Record<string, string>, undefined, unknown>(
    SrsPhpPath.INVOICE_GENERAL_STATEMENT_PDF,
  )

  return useMutation({
    mutationFn: async (payload: PrintGeneralStatementPayload) => {
      const blob = await apiRequest.postBlob({
        ids_invoices: payload.ids_invoices,
        id_dealer: String(payload.id_dealer),
        report_type: payload.report_type,
        fecha_desde: payload.fecha_desde ?? '',
        fecha_hasta: payload.fecha_hasta ?? '',
        attach_time_card: payload.attach_time_card ? '1' : '0',
        exclude_zero: payload.exclude_zero ? '1' : '0',
        include_generic: payload.include_generic ? '1' : '0',
      })
      const result = await assertPdfOrZipBlob(blob, 'Failed to generate general statement PDF')
      openPdfBlobInNewTab(
        result.blob,
        `general_statement_${new Date().toISOString().slice(0, 10)}.pdf`,
      )
    },
  })
}
