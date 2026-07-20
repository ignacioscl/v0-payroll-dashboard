'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import type {
  SetRolePermissionPayload,
  SetRolePermissionResult,
} from '@/lib/roles/roles-types'
import { SrsPhpPath } from '@/types/enum-url'

export function useSetRolePermission() {
  const queryClient = useQueryClient()
  const apiRequest = useSrsApiRequest<SetRolePermissionPayload, undefined, unknown>(
    SrsPhpPath.ROLES_PERMISSIONS,
  )

  return useMutation({
    mutationFn: async (payload: SetRolePermissionPayload) => {
      const raw = await apiRequest.post(payload)
      return assertSrsSuccess<SetRolePermissionResult>(raw, 'Failed to update permission')
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions', result.idRol] })
      queryClient.invalidateQueries({ queryKey: ['roles-list'] })
    },
  })
}
