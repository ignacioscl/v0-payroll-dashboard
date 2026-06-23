'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import type {
  PaymentTypeCatalogItem,
  PaymentTypesCatalogResponse,
} from '@/lib/ttk/payment-type-filter'
import { SrsPhpPath } from '@/types/enum-url'

export const paymentTypesCatalogQueryKey = ['payment-types-catalog'] as const

export function usePaymentTypesCatalog(enabled = true) {
  const apiRequest = useSrsApiRequest<
    undefined,
    Record<string, string | number>,
    PaymentTypesCatalogResponse
  >(SrsPhpPath.PAYMENT_TYPES_CATALOG)

  return useQuery({
    queryKey: paymentTypesCatalogQueryKey,
    enabled,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {})
      return assertSrsSuccess<PaymentTypeCatalogItem[]>(
        raw,
        'Failed to load payment types',
      )
    },
    staleTime: 10 * 60 * 1000,
  })
}
