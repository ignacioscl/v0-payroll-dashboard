'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'
import type {
  TtkPaymentTypeOption,
  TtkPaymentTypesResponse,
} from '@/lib/ttk/ttk-payment-types'

export function useTtkPaymentTypes(
  idDealer: number | null | undefined,
  idEmployee: number | null | undefined,
  idPunch: number | string | null | undefined,
  enabled: boolean,
) {
  const apiRequest = useSrsApiRequest<
    undefined,
    Record<string, string | number>,
    TtkPaymentTypesResponse
  >(SrsPhpPath.TTK_PAYMENT_TYPES)

  return useQuery({
    queryKey: ['ttk-payment-types', idDealer, idEmployee, idPunch],
    enabled: enabled && Boolean(idDealer) && Boolean(idEmployee),
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {
        id_dealer: Number(idDealer),
        id_employee: Number(idEmployee),
        ...(idPunch ? { id_punch: Number(idPunch) } : {}),
      })
      return assertSrsSuccess<TtkPaymentTypeOption[]>(
        raw,
        'Failed to load payment types',
      )
    },
    staleTime: 60_000,
  })
}
