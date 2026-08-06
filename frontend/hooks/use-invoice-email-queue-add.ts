'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { invoiceEmailActiveQueueQueryKey } from '@/hooks/use-invoice-email-active-queue'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type AddInvoiceEmailQueuePayload = {
  idsInvoices: string
  queuename?: string
  fileName?: string
  subject?: string
  message?: string
  replyto?: string
  emailto?: string
  idDealer?: string
  payed?: string
  attachTimeCard?: boolean
}

type AddInvoiceEmailQueueBody = {
  ids_invoices: string
  queuename: string
  file_name: string
  subject: string
  message: string
  replyto: string
  emailto: string
  id_dealer: string
  payed: string
  attach_time_card: string
}

export type AddInvoiceEmailQueueResult = {
  queued?: boolean
  id_queue?: number
  descripcion?: string
}

export function useAddInvoiceEmailQueue() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    AddInvoiceEmailQueueBody,
    undefined,
    { status?: string; error?: { message?: string }; data?: AddInvoiceEmailQueueResult }
  >(SrsPhpPath.INVOICE_EMAIL_QUEUE_ADD)

  return useMutation({
    mutationFn: async (payload: AddInvoiceEmailQueuePayload) => {
      const raw = await apiRequest.post({
        ids_invoices: payload.idsInvoices,
        queuename: payload.queuename?.trim() ?? '',
        file_name: payload.fileName?.trim() ?? '',
        subject: payload.subject ?? '',
        message: payload.message ?? '',
        replyto: payload.replyto ?? '',
        emailto: payload.emailto?.trim() ?? '',
        id_dealer: payload.idDealer ?? '',
        payed: payload.payed ?? '',
        attach_time_card: payload.attachTimeCard ? '1' : '0',
      })
      return assertSrsSuccess<AddInvoiceEmailQueueResult>(raw, 'Failed to add file to email queue')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invoiceEmailActiveQueueQueryKey() })
      void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
    },
  })
}
