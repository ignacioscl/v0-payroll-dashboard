'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { EXPENSES_ANALYTICS_KEY } from '@/hooks/use-expenses-list'
import { fetchAnalytics, type AnalyticsParams, type AnalyticsResponse } from '@/lib/srs-expenses-api'

export function useExpenseAnalytics(params: AnalyticsParams | null) {
  return useQuery<AnalyticsResponse>({
    queryKey: [...EXPENSES_ANALYTICS_KEY, params],
    queryFn: () => fetchAnalytics(params as AnalyticsParams),
    enabled: params !== null,
    placeholderData: keepPreviousData,
  })
}
