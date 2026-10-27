'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchInvoiceOutstanding, type InvoiceOutstanding } from '@/lib/srs-invoices-api'

/**
 * Lo que se debe sin filtro de fecha (toda la historia), para la tarjeta del listado con
 * Payment = Unpaid. Va por su propio pedido: si tarda, el resto de la pantalla ya se ve.
 * `includeRemovedDealers` es el mismo valor del switch que la grilla.
 */
export function useInvoiceOutstanding(
  idDealer: string,
  includeZero: boolean,
  enabled: boolean,
  includeRemovedDealers = false,
) {
  return useQuery<InvoiceOutstanding>({
    queryKey: ['srs-invoices-outstanding', idDealer, includeZero, includeRemovedDealers],
    queryFn: () => fetchInvoiceOutstanding({ idDealer, includeZero, includeRemovedDealers }),
    enabled: enabled && Boolean(idDealer),
  })
}
