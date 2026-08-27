'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createGenericInvoice,
  deleteGenericCatalogItem,
  fetchGenericCatalog,
  fetchGenericInvoice,
  fetchGenericInvoiceConfig,
  fetchGenericTtkEmployees,
  updateGenericInvoice,
  type CreateGenericInvoicePayload,
  type GenericCatalogCategory,
  type GenericCatalogItem,
  type GenericInvoiceConfig,
  type GenericInvoiceDetail,
  type GenericTtkEmployeesResponse,
  type UpdateGenericInvoicePayload,
} from '@/lib/srs-generic-invoices-api'

export const genericInvoiceConfigQueryKey = ['srs-generic-invoice-config'] as const

export function genericCatalogQueryKey(
  cat: GenericCatalogCategory,
  idDealer: number,
  q: string,
) {
  return ['srs-generic-catalog', cat, idDealer, q] as const
}

export function genericInvoiceQueryKey(id: number) {
  return ['srs-generic-invoice', id] as const
}

export function genericTtkEmployeesQueryKey(
  idDealer: number | null,
  dateFrom: string | null,
  dateTo: string | null,
  includeStatementId?: number,
) {
  return ['generic-ttk-employees', idDealer, dateFrom, dateTo, includeStatementId ?? null] as const
}

export function useGenericInvoiceConfig() {
  return useQuery<GenericInvoiceConfig>({
    queryKey: genericInvoiceConfigQueryKey,
    queryFn: fetchGenericInvoiceConfig,
  })
}

export function useGenericCatalog(
  cat: GenericCatalogCategory,
  idDealer: number | null,
  q: string,
) {
  const dealerId = idDealer != null && idDealer > 0 ? idDealer : 0
  const term = q.trim()
  return useQuery<GenericCatalogItem[]>({
    queryKey: genericCatalogQueryKey(cat, dealerId, term),
    queryFn: () => fetchGenericCatalog({ cat, idDealer: dealerId, q: term || undefined }),
    enabled: dealerId > 0,
    placeholderData: keepPreviousData,
  })
}

export function useGenericInvoice(id: number | null, enabled: boolean) {
  return useQuery<GenericInvoiceDetail>({
    queryKey: genericInvoiceQueryKey(id ?? 0),
    queryFn: () => fetchGenericInvoice(id as number),
    enabled: enabled && id != null && id > 0,
  })
}

export function useGenericTtkEmployees(args: {
  idDealer: number | null
  dateFrom: string | null
  dateTo: string | null
  includeStatementId?: number
  enabled?: boolean
}) {
  const ready =
    (args.enabled ?? true) &&
    args.idDealer != null &&
    args.idDealer > 0 &&
    Boolean(args.dateFrom) &&
    Boolean(args.dateTo)
  return useQuery<GenericTtkEmployeesResponse>({
    queryKey: genericTtkEmployeesQueryKey(
      args.idDealer,
      args.dateFrom,
      args.dateTo,
      args.includeStatementId,
    ),
    queryFn: () =>
      fetchGenericTtkEmployees({
        idDealer: args.idDealer as number,
        dateFrom: args.dateFrom as string,
        dateTo: args.dateTo as string,
        includeStatementId: args.includeStatementId,
      }),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
}

export function useDeleteCatalogItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteGenericCatalogItem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['srs-generic-catalog'] })
    },
  })
}

function invalidateGenericInvoiceQueries(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
  void queryClient.invalidateQueries({ queryKey: ['srs-generic-catalog'] })
  void queryClient.invalidateQueries({ queryKey: ['generic-ttk-employees'] })
  if (id != null) {
    void queryClient.invalidateQueries({ queryKey: ['srs-invoice-detail', id] })
    void queryClient.invalidateQueries({ queryKey: genericInvoiceQueryKey(id) })
  }
}

export function useCreateGenericInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateGenericInvoicePayload) => createGenericInvoice(payload),
    onSuccess: () => {
      invalidateGenericInvoiceQueries(queryClient)
    },
  })
}

export function useUpdateGenericInvoice(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateGenericInvoicePayload) => updateGenericInvoice(id, payload),
    onSuccess: () => {
      invalidateGenericInvoiceQueries(queryClient, id)
    },
  })
}
