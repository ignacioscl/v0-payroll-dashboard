'use client'

import { useQuery } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import {
  ALL_ERROR_TYPES,
  errorTypesParam,
  errorTypesQueryKey,
} from '@/lib/filters/error-types-cookie'
import { formatDateParam } from '@/lib/ttk/map-header-filters'
import { fetchDealerRanking } from '@/lib/srs-kpis-api'
import {
  EMPTY_DEALER_RANKING,
  type DealerRankingQueryParams,
  type DealerRankingResponse,
} from '@/lib/ttk/dealer-ranking-types'

export type UseTtkDealerRankingArgs = {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  filtersHydrated?: boolean
  enabled?: boolean
  /** Tipos incluidos. Con los tres excluidos no se pide: ver comentario abajo. */
  includedErrorTypes?: readonly number[]
  /** False mientras `/me` no resolvió. */
  errorTypesReady?: boolean
}

export function ttkDealerRankingQueryKey(args: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  includedErrorTypes?: readonly number[]
}) {
  return [
    'ttk-dealer-ranking',
    args.search,
    args.selectedDealers.slice().sort().join(','),
    args.dateRange?.from?.toISOString(),
    args.dateRange?.to?.toISOString(),
    errorTypesQueryKey(args.includedErrorTypes ?? ALL_ERROR_TYPES),
  ] as const
}

/**
 * Ranking de dealers del Dashboard, de Nest (`GET /srs/punch/dealer-ranking`).
 *
 * Un solo pedido alimenta la tarjeta (top 5) y el modal "View all", así que los
 * dos muestran los mismos números por construcción. Trae Pending y Corrected
 * juntos: el switch es del cliente y moverlo no vuelve a pedir.
 *
 * Calcado de `useTtkDashboardSummary`: mismos insumos, mismo debounce y la misma
 * caché, para que la tarjeta se mueva a la par del resto del Dashboard.
 */
export function useTtkDealerRanking(args: UseTtkDealerRankingArgs) {
  const debouncedDealers = useDebouncedValue(args.selectedDealers, 450)
  const debouncedSearch = useDebouncedValue(args.search, 300)

  const includedErrorTypes = args.includedErrorTypes ?? ALL_ERROR_TYPES
  // Diferencia deliberada con el resumen: con los tres tipos excluidos NO se pide.
  // El resumen se sigue pidiendo porque conserva el número real que muestran las
  // tarjetas tachadas; el ranking no tiene nada que conservar, y la tarjeta ya
  // mostraba vacío en ese caso.
  const noErrorTypes = includedErrorTypes.length === 0

  const queryArgs = {
    search: debouncedSearch,
    selectedDealers: debouncedDealers,
    dateRange: args.dateRange,
    includedErrorTypes,
  }

  const search = debouncedSearch.trim()
  const params: DealerRankingQueryParams = {
    fechaDesde: formatDateParam(args.dateRange?.from),
    fechaHasta: formatDateParam(args.dateRange?.to ?? args.dateRange?.from),
    idDealer: debouncedDealers.join(','),
    errorTypes: errorTypesParam(includedErrorTypes),
    search: search || undefined,
  }

  const enabled =
    (args.filtersHydrated ?? true) &&
    (args.errorTypesReady ?? true) &&
    (args.enabled ?? true) &&
    !noErrorTypes &&
    debouncedDealers.length > 0 &&
    Boolean(params.fechaDesde) &&
    Boolean(params.fechaHasta)

  const query = useQuery({
    queryKey: ttkDealerRankingQueryKey(queryArgs),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DealerRankingResponse> => {
      const res = await fetchDealerRanking(params)
      return {
        pending: res?.pending ?? [],
        corrected: res?.corrected ?? [],
      }
    },
  })

  return {
    ranking: noErrorTypes ? EMPTY_DEALER_RANKING : (query.data ?? EMPTY_DEALER_RANKING),
    /** Los filtros del pedido: el export del modal manda exactamente éstos. `null` sin pedido. */
    params: enabled ? params : null,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
