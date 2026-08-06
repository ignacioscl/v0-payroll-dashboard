'use client'

import { useQuery } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { throwIfSrsFail } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoiceEmailActiveQueueDraft = {
  asunto: string
  message: string
  replyTo: string
  descripcion?: string
}

export function invoiceEmailActiveQueueQueryKey() {
  return ['invoice-email-active-queue'] as const
}

export function useInvoiceEmailActiveQueue(enabled: boolean) {
  const apiRequest = useSrsApiRequest<
    undefined,
    Record<string, string | number>,
    InvoiceEmailActiveQueueDraft | null
  >(SrsPhpPath.EMAIL_ACTIVE_QUEUE)

  return useQuery({
    queryKey: invoiceEmailActiveQueueQueryKey(),
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {})
      throwIfSrsFail(raw, 'Failed to load email queue draft')
      if (raw && typeof raw === 'object' && 'data' in raw) {
        const data = (raw as unknown as { data?: InvoiceEmailActiveQueueDraft | null }).data
        return data ?? null
      }
      return null
    },
  })
}
