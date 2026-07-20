'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import type { RoleActionPayload, RoleListRow, RoleSavePayload } from '@/lib/roles/roles-types'
import { SrsPhpPath } from '@/types/enum-url'

export function useSaveRole() {
  const queryClient = useQueryClient()
  const api = useSrsApiRequest<RoleSavePayload, undefined, unknown>(SrsPhpPath.ROLES_SAVE)

  return useMutation({
    mutationFn: async (payload: RoleSavePayload) => {
      const raw = await api.post(payload)
      return assertSrsSuccess<RoleListRow>(raw, 'Failed to save role')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-list'] })
    },
  })
}

export function useRoleAction() {
  const queryClient = useQueryClient()
  const api = useSrsApiRequest<RoleActionPayload, undefined, unknown>(SrsPhpPath.ROLES_ACTIONS)

  return useMutation({
    mutationFn: async (payload: RoleActionPayload) => {
      const raw = await api.post(payload)
      return assertSrsSuccess(raw, 'Failed to update role')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-list'] })
    },
  })
}
