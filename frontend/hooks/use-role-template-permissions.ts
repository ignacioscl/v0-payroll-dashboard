'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchRoleTemplatePermissions,
  setRoleTemplatePermissions,
  type RoleTemplatePermissionsResponse,
  type SetRoleTemplatePermissionsPayload,
} from '@/lib/srs-role-templates-api'

export function roleTemplatePermissionsQueryKey(idTemplate: number) {
  return ['role-template-permissions', idTemplate] as const
}

export function useRoleTemplatePermissions(idTemplate: number | null, enabled = true) {
  return useQuery<RoleTemplatePermissionsResponse>({
    queryKey: roleTemplatePermissionsQueryKey(idTemplate ?? 0),
    enabled: enabled && idTemplate != null && idTemplate > 0,
    queryFn: () => fetchRoleTemplatePermissions(idTemplate as number),
  })
}

export function useSetRoleTemplatePermissions() {
  const queryClient = useQueryClient()
  return useMutation<
    RoleTemplatePermissionsResponse,
    Error,
    { id: number; payload: SetRoleTemplatePermissionsPayload }
  >({
    mutationFn: ({ id, payload }) => setRoleTemplatePermissions(id, payload),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: roleTemplatePermissionsQueryKey(vars.id) })
      void queryClient.invalidateQueries({ queryKey: ['role-templates-list'] })
      void queryClient.invalidateQueries({ queryKey: ['role-template-roles', vars.id] })
      void queryClient.invalidateQueries({ queryKey: ['role-template-activity', vars.id] })
      void queryClient.invalidateQueries({ queryKey: ['roles-list'] })
      void queryClient.invalidateQueries({ queryKey: ['role-permissions'] })
    },
  })
}
