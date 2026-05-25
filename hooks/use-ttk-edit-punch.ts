'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'
import type {
  TtkEditPunchPayload,
  TtkEditPunchResponse,
} from '@/lib/ttk/ttk-edit-types'

export function useTtkEditPunch() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<TtkEditPunchPayload, undefined, TtkEditPunchResponse>(
    SrsPhpPath.TTK_EDIT,
  )

  return useMutation({
    mutationFn: async (payload: TtkEditPunchPayload) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<NonNullable<TtkEditPunchResponse['data']>>(
        raw,
        'Failed to update punch',
      )
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['ttk-list'] })
      queryClient.invalidateQueries({ queryKey: ['ttk-issue-counts'] })
      queryClient.invalidateQueries({ queryKey: ['ttk-punch-detail', saved.id] })
    },
  })
}
