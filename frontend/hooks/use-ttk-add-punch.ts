'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'
import type { TtkEditPunchResponse } from '@/lib/ttk/ttk-edit-types'

export type TtkAddPunchPayload = {
  id_employee: number
  id_dealer: number
  punch_in: string | null
  punch_in_tz: string | null
  break_start: string | null
  break_start_tz: string | null
  break_end: string | null
  break_end_tz: string | null
  punch_out: string | null
  punch_out_tz: string | null
  punch_in_note?: string | null
  break_start_note?: string | null
  break_end_note?: string | null
  punch_out_note?: string | null
}

export function useTtkAddPunch() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<TtkAddPunchPayload, undefined, TtkEditPunchResponse>(
    SrsPhpPath.TTK_ADD,
  )

  return useMutation({
    mutationFn: async (payload: TtkAddPunchPayload) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<NonNullable<TtkEditPunchResponse['data']>>(
        raw,
        'Failed to create punch',
      )
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['ttk-list'] })
      queryClient.invalidateQueries({ queryKey: ['punch-list'] })
      queryClient.invalidateQueries({ queryKey: ['punch-grouped'] })
      queryClient.invalidateQueries({ queryKey: ['ttk-issue-counts'] })
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: ['ttk-punch-detail', saved.id] })
      }
    },
  })
}
