'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

import { DEFAULT_INVOICE_EMAIL_FILE_NAME } from '@/lib/billing/invoice-email-ui'
import {
  DEFAULT_INVOICE_EMAIL_MESSAGE,
  loadInvoiceEmailPrefs,
  persistInvoiceEmailPrefsAfterSend,
} from '@/lib/billing/invoice-email-prefs'

export type SendInvoiceEmailPayload = {
  idsInvoice: string
  idDealer: string
  emailto: string
  payed?: string
  subject?: string
  message?: string
  replyto?: string
  fileName?: string
}

type SendInvoiceEmailBody = {
  ids_invoice: string
  id_dealer: string
  emailto: string
  payed: string
  subject: string
  message: string
  replyto: string
  file_name: string
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
        message: payload.message ?? DEFAULT_INVOICE_EMAIL_MESSAGE,
        replyto: payload.replyto ?? '',
        file_name: payload.fileName?.trim() || DEFAULT_INVOICE_EMAIL_FILE_NAME,
      })
      assertSrsSuccess<{ sent?: boolean }>(raw, 'Failed to send invoice email')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
    },
  })
}
