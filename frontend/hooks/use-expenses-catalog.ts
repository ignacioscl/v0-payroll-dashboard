'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EXPENSES_ANALYTICS_KEY, EXPENSES_LIST_KEY, EXPENSES_SUMMARY_KEY } from '@/hooks/use-expenses-list'
import { RULES_LIST_KEY } from '@/hooks/use-recurring-rules'
import {
  createCatalogItem,
  deleteCatalogItem,
  fetchCatalog,
  fetchCatalogUsage,
  mergeCatalogItem,
  updateCatalogItem,
  type CatalogCreateResult,
  type CatalogItem,
  type CatalogKind,
  type CatalogListParams,
  type CatalogMergeResult,
  type CatalogUsage,
  type Paginated,
} from '@/lib/srs-expenses-api'

export const catalogQueryKey = (kind: CatalogKind) => ['expenses-catalog', kind] as const

/** Lista paginada (Settings). */
export function useExpenseCatalogList(kind: CatalogKind, params: CatalogListParams, enabled = true) {
  return useQuery<Paginated<CatalogItem>>({
    queryKey: [...catalogQueryKey(kind), 'list', params],
    queryFn: () => fetchCatalog(kind, params),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/** Combos de Add Expense / reglas: activos, por término, hasta 50. */
export function useExpenseCatalogSearch(kind: CatalogKind, term: string, enabled = true) {
  const trimmed = term.trim()
  return useQuery<CatalogItem[]>({
    queryKey: [...catalogQueryKey(kind), 'search', trimmed],
    queryFn: async () => (await fetchCatalog(kind, { term: trimmed, page: 1, pageSize: 50, activeOnly: true })).data,
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

function invalidateCatalog(queryClient: ReturnType<typeof useQueryClient>, kind: CatalogKind) {
  void queryClient.invalidateQueries({ queryKey: catalogQueryKey(kind) })
}

export function useCreateCatalogItem(kind: CatalogKind) {
  const queryClient = useQueryClient()
  return useMutation<CatalogCreateResult, Error, string>({
    mutationFn: (name) => createCatalogItem(kind, name),
    onSuccess: () => invalidateCatalog(queryClient, kind),
  })
}

export function useUpdateCatalogItem(kind: CatalogKind) {
  const queryClient = useQueryClient()
  return useMutation<CatalogItem, Error, { id: number; name?: string; active?: boolean }>({
    mutationFn: ({ id, ...payload }) => updateCatalogItem(kind, id, payload),
    onSuccess: () => invalidateCatalog(queryClient, kind),
  })
}

export function useDeleteCatalogItem(kind: CatalogKind) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: (id) => deleteCatalogItem(kind, id),
    onSuccess: () => invalidateCatalog(queryClient, kind),
  })
}

/** Lo que pasa a la elegida si se unifica la fila (diálogo de Merge). */
export function useCatalogUsage(kind: CatalogKind, id: number | null) {
  return useQuery<CatalogUsage>({
    queryKey: [...catalogQueryKey(kind), 'usage', id],
    queryFn: () => fetchCatalogUsage(kind, id as number),
    enabled: id != null,
    staleTime: 0,
  })
}

/**
 * Unificar cambia el nombre de compañía o categoría de gastos y reglas, y la última categoría de las compañías:
 * se refrescan los dos catálogos, la lista de gastos, sus tarjetas, Analytics y las reglas.
 */
export function useMergeCatalogItem(kind: CatalogKind) {
  const queryClient = useQueryClient()
  return useMutation<CatalogMergeResult, Error, { id: number; targetId: number }>({
    mutationFn: ({ id, targetId }) => mergeCatalogItem(kind, id, targetId),
    onSuccess: () => {
      for (const queryKey of [['expenses-catalog'], EXPENSES_LIST_KEY, EXPENSES_SUMMARY_KEY, EXPENSES_ANALYTICS_KEY, RULES_LIST_KEY]) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] })
      }
    },
  })
}
