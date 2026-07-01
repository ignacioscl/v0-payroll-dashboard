'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoiceNoteStatusItem = {
  id: number
  code: string
  defaultName: string
  displayName: string
}

export type InvoiceNoteStatusResponse = {
  ownerId: number
  statuses: InvoiceNoteStatusItem[]
}

export const invoiceNoteStatusQueryKey = ['invoice-note-status'] as const

export function useInvoiceNoteStatuses(enabled = true) {
  const apiRequest = useSrsApiRequest<
    undefined,
    Record<string, string | number>,
    { status?: string; error?: { message?: string }; data?: InvoiceNoteStatusResponse }
  >(SrsPhpPath.INVOICE_NOTE_STATUS)

  return useQuery({
    queryKey: invoiceNoteStatusQueryKey,
    enabled,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {})
      return assertSrsSuccess<InvoiceNoteStatusResponse>(
        raw,
        'Failed to load invoice note statuses',
      )
    },
    staleTime: 30_000,
  })
}

export function useUpdateInvoiceNoteStatusLabel() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    { id: number; displayName: string },
    undefined,
    { status?: string; error?: { message?: string }; data?: InvoiceNoteStatusResponse }
  >(SrsPhpPath.INVOICE_NOTE_STATUS)

  return useMutation({
    mutationFn: async (payload: { id: number; displayName: string }) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<InvoiceNoteStatusResponse>(
        raw,
        'Failed to update status label',
      )
    },
    onSuccess: (data) => {
      queryClient.setQueryData(invoiceNoteStatusQueryKey, data)
    },
  })
}
