'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SetRolePermissionPayload } from '@/lib/roles/roles-types'
import { setRolePermissions } from '@/lib/srs-roles-api'

export function useSetRolePermission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SetRolePermissionPayload) => {
      return setRolePermissions(payload)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions', result.idRol] })
      queryClient.invalidateQueries({ queryKey: ['roles-list'] })
      queryClient.invalidateQueries({ queryKey: ['role-activity', result.idRol] })
    },
  })
}
