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
  EMPTY_TTK_ISSUE_COUNTS,
  type TtkIssueCountsData,
  type TtkIssueCountsResponse,
} from '@/lib/ttk/ttk-issue-counts-types'
import { SrsPhpPath } from '@/types/enum-url'
import type { DateRange } from 'react-day-picker'
import { useSrsMe } from '@/lib/auth/use-srs-me'

export type UseTtkIssueCountsArgs = {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  selectedEmployeeId?: number | null
  filtersHydrated?: boolean
  enabled?: boolean
  /** Tipos incluidos. NO entra al gate `enabled`: ver comentario abajo. */
  includedErrorTypes?: readonly number[]
  /** False mientras `/me` no resolvió. */
  errorTypesReady?: boolean
}

export function ttkIssueCountsQueryKey(args: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  selectedEmployeeId?: number | null
  includedErrorTypes?: readonly number[]
}) {
  return [
    'ttk-issue-counts',
    args.search,
    args.selectedEmployeeId ?? null,
    args.selectedDealers.slice().sort().join(','),
    args.dateRange?.from?.toISOString(),
    args.dateRange?.to?.toISOString(),
    // Sin esto, destildar un tipo sirve el conteo anterior (staleTime 60s).
    errorTypesQueryKey(args.includedErrorTypes ?? [1, 2, 3]),
  ] as const
}

export function useTtkIssueCounts(args: UseTtkIssueCountsArgs) {
  const { user } = useSrsMe()
  const scopeUser = toPayrollScopeUser(user)
  const debouncedDealers = useDebouncedValue(args.selectedDealers, 450)
  const debouncedSearch = useDebouncedValue(args.search, 300)

  const apiRequest = useSrsApiRequest<unknown, Record<string, string | number>, TtkIssueCountsResponse>(
    SrsPhpPath.TTK_ISSUE_COUNTS,
  )

  const queryArgs = {
    search: debouncedSearch,
    selectedDealers: debouncedDealers,
    dateRange: args.dateRange,
    selectedEmployeeId: args.selectedEmployeeId ?? null,
    includedErrorTypes: args.includedErrorTypes,
  }

  const params = buildTtkScopeParams({ ...queryArgs, scopeUser })
  appendErrorTypesParam(params, args.includedErrorTypes)
  // OJO: el gate NO mira `includedErrorTypes`. Con los tres tipos destildados los
  // contadores IGUAL se piden (sin el parámetro), porque son la única fuente del
  // número real que muestra cada tarjeta tachada. Traducirlo a
  // `includedErrorTypes.length > 0` haría caer el hook a EMPTY_TTK_ISSUE_COUNTS y
  // las tarjetas mostrarían 0. El que sí lo mira es el gate de las grillas.
  const enabled =
    (args.filtersHydrated ?? true) &&
    (args.errorTypesReady ?? true) &&
    (args.enabled ?? true) &&
    debouncedDealers.length > 0 &&
    Boolean(params.fecha_desde) &&
    Boolean(params.fecha_hasta)

  const query = useQuery({
    queryKey: ttkIssueCountsQueryKey(queryArgs),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const json = await apiRequest.getCustom('', undefined, params)
      const payload = assertSrsSuccess<TtkIssueCountsResponse['data']>(
        json,
        'Failed to load issue counts',
      )
      return payload?.counts ?? EMPTY_TTK_ISSUE_COUNTS
    },
  })

  return {
    counts: (query.data ?? EMPTY_TTK_ISSUE_COUNTS) as TtkIssueCountsData,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
