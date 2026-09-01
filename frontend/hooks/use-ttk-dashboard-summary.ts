'use client'

import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import {
  appendErrorTypesParam,
  buildTtkScopeParams,
  toPayrollScopeUser,
} from '@/lib/ttk/map-header-filters'
import { errorTypesQueryKey } from '@/lib/filters/error-types-cookie'
import {
  EMPTY_TTK_DASHBOARD_SUMMARY,
  type TtkDashboardSummaryData,
  type TtkDashboardSummaryResponse,
} from '@/lib/ttk/ttk-dashboard-summary-types'
import { SrsPhpPath } from '@/types/enum-url'
import type { DateRange } from 'react-day-picker'
import { useSrsMe } from '@/lib/auth/use-srs-me'

export type UseTtkDashboardSummaryArgs = {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  filtersHydrated?: boolean
  enabled?: boolean
  /** Tipos incluidos. NO entra al gate `enabled`: ver comentario abajo. */
  includedErrorTypes?: readonly number[]
  /** False mientras `/me` no resolvió. */
  errorTypesReady?: boolean
}

export function ttkDashboardSummaryQueryKey(args: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  includedErrorTypes?: readonly number[]
}) {
  return [
    'ttk-dashboard-summary',
    args.search,
    args.selectedDealers.slice().sort().join(','),
    args.dateRange?.from?.toISOString(),
    args.dateRange?.to?.toISOString(),
    errorTypesQueryKey(args.includedErrorTypes ?? [1, 2, 3]),
  ] as const
}

export function useTtkDashboardSummary(args: UseTtkDashboardSummaryArgs) {
  const { user } = useSrsMe()
  const scopeUser = toPayrollScopeUser(user)
  const debouncedDealers = useDebouncedValue(args.selectedDealers, 450)
  const debouncedSearch = useDebouncedValue(args.search, 300)

  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    TtkDashboardSummaryResponse
  >(SrsPhpPath.TTK_DASHBOARD_SUMMARY)

  const queryArgs = {
    search: debouncedSearch,
    selectedDealers: debouncedDealers,
    dateRange: args.dateRange,
    includedErrorTypes: args.includedErrorTypes,
  }

  const params = buildTtkScopeParams({ ...queryArgs, scopeUser })
  appendErrorTypesParam(params, args.includedErrorTypes)
  // Igual que en counts: el gate NO mira la lista. Con los tres destildados el
  // summary se sigue pidiendo (sin el parámetro) para conservar `by_type` crudo.
  const enabled =
    (args.filtersHydrated ?? true) &&
    (args.errorTypesReady ?? true) &&
    (args.enabled ?? true) &&
    debouncedDealers.length > 0 &&
    Boolean(params.fecha_desde) &&
    Boolean(params.fecha_hasta)

  const query = useQuery({
    queryKey: ttkDashboardSummaryQueryKey(queryArgs),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const json = await apiRequest.getCustom('', undefined, params)
      const payload = assertSrsSuccess<TtkDashboardSummaryResponse['data']>(
        json,
        'Failed to load dashboard summary',
      )
      return payload?.summary ?? EMPTY_TTK_DASHBOARD_SUMMARY
    },
  })

  return {
    summary: (query.data ?? EMPTY_TTK_DASHBOARD_SUMMARY) as TtkDashboardSummaryData,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
