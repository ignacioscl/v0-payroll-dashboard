'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'
import type { TtkPunchLogEntry, TtkPunchLogResponse } from '@/lib/ttk/ttk-log-types'

export function ttkPunchLogQueryKey(id: number | string | null) {
  return ['ttk-punch-log', id] as const
}

export function useTtkPunchLog(id: number | string | null, enabled = true) {
  const apiRequest = useSrsApiRequest<
    unknown,
    { id_ttk: number | string },
    TtkPunchLogResponse
  >(SrsPhpPath.TTK_LOG)

  return useQuery<TtkPunchLogEntry[]>({
    queryKey: ttkPunchLogQueryKey(id),
    enabled: enabled && id != null && id !== '',
    staleTime: 30 * 1000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, { id_ttk: id! })
      return assertSrsSuccess<TtkPunchLogEntry[]>(raw, 'Failed to load punch change log')
    },
  })
}
