'use client'

import * as React from 'react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import {
  WO_TO_BE_BILLED_CONFIG_KEY,
  WO_TO_BE_BILLED_LIST_KEY,
  WO_TO_BE_BILLED_SUMMARY_KEY,
  type WoFilterRequest,
} from '@/hooks/use-wo-to-be-billed'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertPdfBlob } from '@/lib/srs/parse-srs-response'
import {
  deleteWorkOrders,
  generateIndividualInvoice,
  generateWoInvoices,
  updateWorkOrderRoPo,
} from '@/lib/srs-wo-to-be-billed-api'
import { SrsPhpPath } from '@/types/enum-url'

/**
 * Las acciones de WO to be Billed (plans/plan-wo-to-be-billed-v0, T10). **Las listas se invalidan también cuando el
 * pedido falla o vence** (`onSettled`): con un corte a mitad de camino la invoice puede haber quedado creada.
 */

function invalidateWoLists(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: [WO_TO_BE_BILLED_LIST_KEY] })
  void queryClient.invalidateQueries({ queryKey: [WO_TO_BE_BILLED_SUMMARY_KEY] })
  void queryClient.invalidateQueries({ queryKey: [WO_TO_BE_BILLED_CONFIG_KEY] })
}

/** Generar crea invoices: también cambian las listas de Invoices. */
function invalidateWoAndInvoices(queryClient: QueryClient) {
  invalidateWoLists(queryClient)
  void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
  void queryClient.invalidateQueries({ queryKey: ['srs-invoices-summary'] })
  void queryClient.invalidateQueries({ queryKey: ['srs-invoices-outstanding'] })
}

/**
 * Un solo pedido por clic: una guarda sincrónica, además del botón deshabilitado (que llega un render tarde). Sin
 * ella, el segundo pedido espera el candado del servidor y vuelve con «There is nothing to invoice» después del éxito
 * del primero. `run` devuelve `undefined` si ya había uno en curso.
 */
export function useSingleFlight() {
  const busy = React.useRef(false)
  return React.useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined
    busy.current = true
    try {
      return await fn()
    } finally {
      busy.current = false
    }
  }, [])
}

export function useGenerateWoInvoices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { request: WoFilterRequest; woIds: number[] }) => generateWoInvoices(vars.request, vars.woIds),
    onSettled: () => invalidateWoAndInvoices(queryClient),
  })
}

export function useGenerateIndividualInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { idInvoice: number; includeZero: boolean }) =>
      generateIndividualInvoice(vars.idInvoice, vars.includeZero),
    onSettled: () => invalidateWoAndInvoices(queryClient),
  })
}

export function useDeleteWorkOrders() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { ids: number[]; bulk: boolean }) => deleteWorkOrders(vars.ids, vars.bulk),
    onSettled: () => invalidateWoLists(queryClient),
  })
}

export function useUpdateWorkOrderRoPo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { idInvoice: number; field: 'ro' | 'po'; value: string }) =>
      updateWorkOrderRoPo(vars.idInvoice, vars.field, vars.value),
    onSettled: () => invalidateWoLists(queryClient),
  })
}

/**
 * El PDF de una WO por `wo-pdf.php` (T7): Print WO, o la invoice individual si la WO la tiene. Devuelve el blob; quien
 * llama lo carga en la pestaña que abrió en el clic (`openPdfTabNow`).
 */
export function useWoPdf() {
  const apiRequest = useSrsApiRequest<{ idInvoice: number }, undefined, unknown>(SrsPhpPath.WO_PDF)
  // `useSrsApiRequest` devuelve un objeto nuevo en cada render: se lee de un ref para que la función sea estable (si
  // no, las acciones de la fila cambian en cada render y la tabla se redibuja entera).
  const apiRef = React.useRef(apiRequest)
  React.useEffect(() => {
    apiRef.current = apiRequest
  })
  return React.useCallback(async (idInvoice: number): Promise<Blob> => {
    const blob = await apiRef.current.postBlob({ idInvoice })
    return assertPdfBlob(blob, 'The PDF could not be opened.')
  }, [])
}
