'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createGenericInvoice,
  deleteGenericCatalogItem,
  fetchGenericCatalog,
  fetchGenericInvoiceConfig,
  type CreateGenericInvoicePayload,
  type GenericCatalogCategory,
  type GenericCatalogItem,
  type GenericInvoiceConfig,
} from '@/lib/srs-generic-invoices-api'

export const genericInvoiceConfigQueryKey = ['srs-generic-invoice-config'] as const

export function genericCatalogQueryKey(
  cat: GenericCatalogCategory,
  idDealer: number,
  q: string,
) {
  return ['srs-generic-catalog', cat, idDealer, q] as const
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

export function useDeleteCatalogItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteGenericCatalogItem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['srs-generic-catalog'] })
    },
  })
}

export function useCreateGenericInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateGenericInvoicePayload) => createGenericInvoice(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['srs-generic-catalog'] })
    },
  })
}
