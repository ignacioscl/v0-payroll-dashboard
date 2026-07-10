'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

const DEFAULT_EMAIL_MESSAGE =
  'Your current billing statements are linked below.  Please let us know if you have any questions.'

export type SendInvoiceEmailPayload = {
  idsInvoice: string
  idDealer: string
  emailto: string
  payed?: string
  subject?: string
  message?: string
  replyto?: string
}

type SendInvoiceEmailBody = {
  ids_invoice: string
  id_dealer: string
  emailto: string
  payed: string
  subject: string
  message: string
  replyto: string
}

export function useSendInvoiceEmail() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    SendInvoiceEmailBody,
    undefined,
    { status?: string; error?: { message?: string }; data?: { sent?: boolean } }
  >(SrsPhpPath.INVOICE_STATEMENT_SEND_EMAIL)

  return useMutation({
    mutationFn: async (payload: SendInvoiceEmailPayload) => {
      const raw = await apiRequest.post({
        ids_invoice: payload.idsInvoice,
        id_dealer: payload.idDealer,
        emailto: payload.emailto,
        payed: payload.payed ?? '',
        subject: payload.subject ?? '',
        message: payload.message ?? DEFAULT_EMAIL_MESSAGE,
        replyto: payload.replyto ?? '',
      })
      assertSrsSuccess<{ sent?: boolean }>(raw, 'Failed to send invoice email')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
    },
  })
}
