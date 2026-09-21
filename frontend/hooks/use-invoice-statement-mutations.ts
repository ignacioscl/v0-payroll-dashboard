'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type InvoiceDiscountPayload = {
  id_invoice_statement: number
  discountType: 1 | 2
  discount: number | string
  discountDetail?: string
}

export type InvoicePoRoPayload = {
  id_invoice_statement: number
  field: 'PO' | 'RO'
  value: string
}

export type InvoiceStatementNoteRow = {
  id: number
  noteText: string
  fecha: string
  author: { id: number; nombre: string }
  status: { id: number; name: string; code: string }
}

export type InvoiceNoteStatusOption = {
  id: number
  code: string
  defaultName: string
  displayName: string
}

export type InvoiceStatementNotesResponse = {
  notes: InvoiceStatementNoteRow[]
  statuses: InvoiceNoteStatusOption[]
}

/**
 * Todo lo que cambia la plata de una invoice tiene que refrescar también los totales: las
 * tarjetas de arriba y la barra de abajo salen de `srs-invoices-summary` y la tarjeta de deuda
 * de `srs-invoices-outstanding`, que son claves aparte — invalidar `srs-invoices` no las toca,
 * porque no es prefijo de ninguna de las dos. Sin esto, se guarda un descuento, la fila queda
 * bien y los totales siguen mostrando el número viejo.
 */
function invalidateInvoiceQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
  void queryClient.invalidateQueries({ queryKey: ['srs-invoices-summary'] })
  void queryClient.invalidateQueries({ queryKey: ['srs-invoices-outstanding'] })
  void queryClient.invalidateQueries({ queryKey: ['srs-invoice-detail'] })
}

export function useDeleteInvoiceStatements() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    { id_statement?: number; ids_statement?: number[] },
    undefined,
    { status?: string; error?: { message?: string }; data?: { deleted?: number[] } }
  >(SrsPhpPath.INVOICE_STATEMENT_DELETE)

  return useMutation({
    mutationFn: async (payload: { id_statement?: number; ids_statement?: number[] }) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<{ deleted?: number[] }>(raw, 'Failed to delete invoice')
    },
    onSuccess: () => invalidateInvoiceQueries(queryClient),
  })
}

export function useSetInvoiceDiscount() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    InvoiceDiscountPayload,
    undefined,
    { status?: string; error?: { message?: string }; data?: unknown }
  >(SrsPhpPath.INVOICE_STATEMENT_DISCOUNT)

  return useMutation({
    mutationFn: async (payload: InvoiceDiscountPayload) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess(raw, 'Failed to set discount')
    },
    onSuccess: () => invalidateInvoiceQueries(queryClient),
  })
}

export function useEditInvoicePoRo() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    InvoicePoRoPayload,
    undefined,
    { status?: string; error?: { message?: string }; data?: { po?: string; ro?: string } }
  >(SrsPhpPath.INVOICE_STATEMENT_PO_RO)

  return useMutation({
    mutationFn: async (payload: InvoicePoRoPayload) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<{ po?: string; ro?: string }>(raw, 'Failed to update PO/RO')
    },
    onSuccess: () => invalidateInvoiceQueries(queryClient),
  })
}

export function useRemoveWoFromInvoice() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    { id_statement: number; id_service_rel: number },
    undefined,
    { status?: string; error?: { message?: string }; data?: { removed?: boolean } }
  >(SrsPhpPath.INVOICE_STATEMENT_REMOVE_WO)

  return useMutation({
    mutationFn: async (payload: { id_statement: number; id_service_rel: number }) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess(raw, 'Failed to remove work order from invoice')
    },
    onSuccess: (_data, vars) => {
      // Sacar una WO de la invoice cambia su plata: van también los totales.
      void queryClient.invalidateQueries({ queryKey: ['srs-invoice-detail', vars.id_statement] })
      invalidateInvoiceQueries(queryClient)
    },
  })
}

export function invoiceStatementNotesQueryKey(statementId: number) {
  return ['invoice-statement-notes', statementId] as const
}

export function useInvoiceStatementNotes(statementId: number, enabled: boolean) {
  const apiRequest = useSrsApiRequest<
    undefined,
    { id_invoice_statement: number },
    { status?: string; error?: { message?: string }; data?: InvoiceStatementNotesResponse }
  >(SrsPhpPath.INVOICE_STATEMENT_NOTES)

  return useQuery({
    queryKey: invoiceStatementNotesQueryKey(statementId),
    enabled: enabled && statementId > 0,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {
        id_invoice_statement: statementId,
      })
      return assertSrsSuccess<InvoiceStatementNotesResponse>(
        raw,
        'Failed to load invoice notes',
      )
    },
  })
}

export function useSaveInvoiceStatementNote() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<
    { id_invoice_statement: number; id_status: number; note_text: string },
    undefined,
    { status?: string; error?: { message?: string }; data?: { note?: InvoiceStatementNoteRow } }
  >(SrsPhpPath.INVOICE_STATEMENT_NOTES)

  return useMutation({
    mutationFn: async (payload: {
      id_invoice_statement: number
      id_status: number
      note_text: string
    }) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<{ note?: InvoiceStatementNoteRow }>(raw, 'Failed to save note')
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: invoiceStatementNotesQueryKey(vars.id_invoice_statement),
      })
      void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
    },
  })
}
