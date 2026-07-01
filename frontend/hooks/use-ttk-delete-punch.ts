'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type TtkDeletePunchPayload = {
  id_ttk: number | string
  action: 'delete' | 'activate'
}

type TtkDeletePunchResponse = {
  data?: { id: number | string; action: string }
  status?: string
  error?: { message?: string }
}

export function useTtkDeletePunch() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<TtkDeletePunchPayload, undefined, TtkDeletePunchResponse>(
    SrsPhpPath.TTK_DELETE,
  )

  return useMutation({
    mutationFn: async (payload: TtkDeletePunchPayload) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<NonNullable<TtkDeletePunchResponse['data']>>(
        raw,
        payload.action === 'activate' ? 'Failed to activate punch' : 'Failed to delete punch',
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ttk-list'] })
      queryClient.invalidateQueries({ queryKey: ['ttk-issue-counts'] })
    },
  })
}
