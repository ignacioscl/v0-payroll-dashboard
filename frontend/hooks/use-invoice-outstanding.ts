'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchInvoiceOutstanding, type InvoiceOutstanding } from '@/lib/srs-invoices-api'

/**
 * Lo que se debe sin filtro de fecha (toda la historia), para la tarjeta del listado con
 * Payment = Unpaid. Va por su propio pedido: si tarda, el resto de la pantalla ya se ve.
 */
export function useInvoiceOutstanding(
  idDealer: string,
  includeZero: boolean,
  enabled: boolean,
) {
  return useQuery<InvoiceOutstanding>({
    queryKey: ['srs-invoices-outstanding', idDealer, includeZero],
    queryFn: () => fetchInvoiceOutstanding({ idDealer, includeZero }),
    enabled: enabled && Boolean(idDealer),
  })
}
