'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createCatalogItem,
  fetchCatalog,
  updateCatalogItem,
  type CatalogItem,
  type CatalogKind,
  type CatalogListParams,
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
  return useMutation<CatalogItem & { existing: boolean }, Error, string>({
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
