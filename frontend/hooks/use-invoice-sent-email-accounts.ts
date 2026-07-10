'use client'

import { useQuery } from '@tanstack/react-query'

import { resolveInvoiceEmailAccountsDealerParam } from '@/lib/billing/invoice-email-accounts'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoiceSentEmailAccount = {
  email: string
}

export function invoiceSentEmailAccountsQueryKey(idDealer: string) {
  return ['invoice-sent-email-accounts', idDealer] as const
}

export function useInvoiceSentEmailAccounts(idDealer: string, enabled: boolean) {
  const dealerParam = resolveInvoiceEmailAccountsDealerParam(idDealer)
  const apiRequest = useSrsApiRequest<
    undefined,
    { id_dealer: string },
    InvoiceSentEmailAccount[]
  >(SrsPhpPath.INVOICE_SENT_EMAIL_ACCOUNTS)

  return useQuery({
    queryKey: invoiceSentEmailAccountsQueryKey(dealerParam),
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, { id_dealer: dealerParam })
      return assertSrsSuccess<InvoiceSentEmailAccount[]>(
        raw,
        'Failed to load sent email accounts',
      )
    },
  })
}
