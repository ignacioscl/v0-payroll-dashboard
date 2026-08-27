'use client'

import { useQuery } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoiceTtkRolDpto = {
  department?: string
  role?: string
}

/** Row shape from payroll/invoice-ttk-detail.php (PayrollReportPojo + processDailyAcumOT). */
export type InvoiceTtkDetailRow = {
  id?: number
  idTtk?: number
  nombreEmployee?: string
  rolDpto?: InvoiceTtkRolDpto | null
  fecha?: string | null
  hoursReg?: number | string | null
  hoursOt?: number | string | null
  payHoursReg?: number | string | null
  payHoursOt?: number | string | null
  piecework?: number | string | null
  salary?: number | string | null
  commission?: number | string | null
  flatRate?: number | string | null
  dailyPay?: number | string | null
  closing?: number | string | null
  sunday?: number | string | null
  extra?: number | string | null
  shop?: number | string | null
  halfDay?: number | string | null
  overtime?: number | string | null
  proratedDay?: number | string | null
  payrollTaxes?: number | string | null
  amountDealer?: number | string | null
}

export type InvoiceTtkDetailParams = {
  id_invoice_statement: number
  /** Accepted for legacy parity; PHP does not filter on it. */
  id_billing?: number | string | null
  /** Accepted for legacy parity; PHP does not filter on it. */
  payed?: number | string | null
}

export function invoiceTtkDetailQueryKey(
  id: number | null,
  idBilling?: number | string | null,
) {
  return ['invoice-ttk-detail', id, idBilling ?? 0] as const
}

export function useInvoiceTtkDetail(
  id: number | null,
  enabled: boolean,
  idBilling?: number | string | null,
) {
  const apiRequest = useSrsApiRequest<
    undefined,
    InvoiceTtkDetailParams,
    InvoiceTtkDetailRow[]
  >(SrsPhpPath.INVOICE_TTK_DETAIL)

  return useQuery<InvoiceTtkDetailRow[]>({
    queryKey: invoiceTtkDetailQueryKey(id, idBilling),
    enabled: enabled && id != null && id > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {
        id_invoice_statement: id!,
        id_billing: idBilling ?? 0,
      })
      return assertSrsSuccess<InvoiceTtkDetailRow[]>(
        raw,
        'Failed to load TTK invoice detail',
      )
    },
  })
}
