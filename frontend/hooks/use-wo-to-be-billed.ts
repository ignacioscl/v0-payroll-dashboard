'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import {
  fetchWoToBeBilledConfig,
  fetchWoToBeBilledList,
  fetchWoToBeBilledSummary,
  type WoToBeBilledListResponse,
} from '@/lib/srs-wo-to-be-billed-api'

export type WoFilterRequest = Record<string, string | number | boolean | number[]>

/** Las claves de React Query de la pantalla: las mutaciones las invalidan (también cuando fallan). */
export const WO_TO_BE_BILLED_LIST_KEY = 'srs-wo-to-be-billed'
export const WO_TO_BE_BILLED_SUMMARY_KEY = 'srs-wo-to-be-billed-summary'
export const WO_TO_BE_BILLED_CONFIG_KEY = 'srs-wo-to-be-billed-config'

/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T9): la lista con scroll infinito de a `pageSize`, el total y los
 * permisos de la fila. Los tres pedidos salen juntos, sin esperarse uno al otro; `request = null` (sin un dealer) los
 * apaga.
 */
export function useWoToBeBilledList(request: WoFilterRequest | null, pageSize: number) {
  return useInfiniteQuery<WoToBeBilledListResponse>({
    queryKey: [WO_TO_BE_BILLED_LIST_KEY, request, pageSize],
    queryFn: ({ pageParam }) => fetchWoToBeBilledList(request as WoFilterRequest, pageParam as number, pageSize),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: request !== null,
  })
}

export function useWoToBeBilledSummary(request: WoFilterRequest | null) {
  return useQuery({
    queryKey: [WO_TO_BE_BILLED_SUMMARY_KEY, request],
    queryFn: () => fetchWoToBeBilledSummary(request as WoFilterRequest),
    enabled: request !== null,
  })
}

export function useWoToBeBilledConfig(idDealer: number | null) {
  return useQuery({
    queryKey: [WO_TO_BE_BILLED_CONFIG_KEY, idDealer],
    queryFn: () => fetchWoToBeBilledConfig(idDealer as number),
    enabled: idDealer != null,
    staleTime: 60_000,
  })
}
