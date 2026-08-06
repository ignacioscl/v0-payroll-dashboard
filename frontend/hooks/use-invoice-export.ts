'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { invoiceEmailActiveQueueQueryKey } from '@/hooks/use-invoice-email-active-queue'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import {
  assertSrsSuccess,
  downloadBlob,
  getSrsErrorMessage,
} from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoiceExportType = 1 | 2
export type InvoiceExportAction = 'download' | 'email' | 'queue'

export type InvoiceExportFilters = {
  idDealer?: string
  fechaDesde?: string
  fechaHasta?: string
  payed?: string
  idDepartment?: string
  idService?: string
  filterNotCero?: 0 | 1
  includeZero?: boolean
  idsEmployees?: string
  isNotinIdsEmployees?: boolean
}

export type InvoiceExportPayload = InvoiceExportFilters & {
  exportType: InvoiceExportType
  action: InvoiceExportAction
  idsInvoices: string
  emailto?: string
  subject?: string
  message?: string
  replyto?: string
  fileName?: string
  queuename?: string
  attachTimeCard?: boolean
}

type InvoiceExportBody = {
  export_type: number
  action: InvoiceExportAction
  ids_invoices: string
  id_dealer: string
  fecha_desde: string
  fecha_hasta: string
  payed: string
  id_department: string
  id_service: string
  filter_not_cero: string
  include_zero: string
  ids_employees: string
  is_notin_ids_employees: string
  emailto: string
  subject: string
  message: string
  replyto: string
  file_name: string
  queuename: string
  attach_time_card: string
}

export type InvoiceExportResult = {
  sent?: boolean
  queued?: boolean
  id_queue?: number
  descripcion?: string
}

function toBody(payload: InvoiceExportPayload): InvoiceExportBody {
  return {
    export_type: payload.exportType,
    action: payload.action,
    ids_invoices: payload.idsInvoices,
    id_dealer: payload.idDealer ?? '',
    fecha_desde: payload.fechaDesde ?? '',
    fecha_hasta: payload.fechaHasta ?? '',
    payed: payload.payed ?? '',
    id_department: payload.idDepartment ?? '',
    id_service: payload.idService ?? '',
    filter_not_cero:
      payload.filterNotCero !== undefined ? String(payload.filterNotCero) : '',
    include_zero:
      payload.includeZero === undefined ? '' : payload.includeZero ? '1' : '0',
    ids_employees: payload.idsEmployees ?? '',
    is_notin_ids_employees: payload.isNotinIdsEmployees ? '1' : '0',
    emailto: payload.emailto?.trim() ?? '',
    subject: payload.subject ?? '',
    message: payload.message ?? '',
    replyto: payload.replyto ?? '',
    file_name: payload.fileName?.trim() ?? '',
    queuename: payload.queuename?.trim() ?? '',
    attach_time_card: payload.attachTimeCard ? '1' : '0',
  }
}

async function assertCsvBlob(blob: Blob, fallbackMessage: string): Promise<Blob> {
  const textStart = await blob.slice(0, 200).text()
  const trimmed = textStart.trim()
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(await blob.text()) as {
        error?: { message?: string }
        status?: string
      }
      throw new Error(json.error?.message || fallbackMessage)
    } catch (err) {
      if (err instanceof Error && err.message !== fallbackMessage) {
        throw err
      }
      throw new Error(fallbackMessage)
    }
  }
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error('Session expired — sign in again and retry.')
  }
  return blob.type === 'text/csv' ? blob : new Blob([blob], { type: 'text/csv' })
}

export function useInvoiceExport() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    InvoiceExportBody,
    undefined,
    { status?: string; error?: { message?: string }; data?: InvoiceExportResult }
  >(SrsPhpPath.INVOICE_EXPORT)

  return useMutation({
    mutationFn: async (payload: InvoiceExportPayload) => {
      const body = toBody(payload)

      if (payload.action === 'download') {
        const blob = await apiRequest.postBlob(body)
        const csv = await assertCsvBlob(blob, 'Failed to export invoices')
        const base =
          payload.fileName?.trim() ||
          (payload.exportType === 1 ? 'report_invoice' : 'report_invoice_wo_details')
        const name = base.toLowerCase().endsWith('.csv') ? base : `${base}.csv`
        downloadBlob(csv, name)
        return { downloaded: true } as const
      }

      const raw = await apiRequest.post(body)
      return assertSrsSuccess<InvoiceExportResult>(raw, 'Failed to export invoices')
    },
    onSuccess: (_data, variables) => {
      if (variables.action === 'queue') {
        void queryClient.invalidateQueries({ queryKey: invoiceEmailActiveQueueQueryKey() })
      }
    },
  })
}

export function invoiceExportErrorMessage(error: unknown, fallback: string): string {
  return getSrsErrorMessage(error, fallback)
}
