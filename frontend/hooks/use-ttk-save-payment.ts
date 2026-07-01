'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'
import type {
  TtkSavePaymentPayload,
  TtkSavePaymentResponse,
} from '@/lib/ttk/ttk-payment-types'

export function useTtkSavePayment() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    TtkSavePaymentPayload,
    undefined,
    TtkSavePaymentResponse
  >(SrsPhpPath.TTK_SAVE_PAYMENT)

  return useMutation({
    mutationFn: async (payload: TtkSavePaymentPayload) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<NonNullable<TtkSavePaymentResponse['data']>>(
        raw,
        'Failed to update payment type',
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ttk-list'] })
      queryClient.invalidateQueries({ queryKey: ['ttk-issue-counts'] })
    },
  })
}
