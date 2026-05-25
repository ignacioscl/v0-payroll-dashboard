'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'
import type {
  TtkPunchDetail,
  TtkPunchDetailResponse,
} from '@/lib/ttk/ttk-edit-types'

export function ttkPunchDetailQueryKey(id: number | string | null) {
  return ['ttk-punch-detail', id] as const
}

export function useTtkPunchDetail(id: number | string | null, enabled = true) {
  const apiRequest = useSrsApiRequest<
    unknown,
    { id_ttk: number | string },
    TtkPunchDetailResponse
  >(SrsPhpPath.TTK_GET_BY_ID)

  return useQuery<TtkPunchDetail>({
    queryKey: ttkPunchDetailQueryKey(id),
    enabled: enabled && id != null && id !== '',
    staleTime: 30 * 1000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, { id_ttk: id! })
      return assertSrsSuccess<TtkPunchDetail>(raw, 'Failed to load punch detail')
    },
  })
}
