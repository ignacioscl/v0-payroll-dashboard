'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import type {
  AssignAllServicesPayload,
  RoleServicesResponse,
  SetRoleServicesPayload,
} from '@/lib/roles/roles-types'
import { SrsPhpPath } from '@/types/enum-url'

export function useRoleServices(idRol: number | null, enabled = true) {
  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    unknown
  >(SrsPhpPath.ROLES_SERVICES)

  return useQuery({
    queryKey: ['role-services', idRol],
    enabled: enabled && idRol != null && idRol > 0,
    staleTime: 5_000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, { id_rol: idRol as number })
      return assertSrsSuccess<RoleServicesResponse>(raw, 'Failed to load services')
    },
  })
}

export function useSetRoleServices() {
  const queryClient = useQueryClient()
  const api = useSrsApiRequest<SetRoleServicesPayload, undefined, unknown>(SrsPhpPath.ROLES_SERVICES)

  return useMutation({
    mutationFn: async (payload: SetRoleServicesPayload) => {
      const raw = await api.post(payload)
      return assertSrsSuccess(raw, 'Failed to update services')
    },
    onSettled: (_data, _err, payload) => {
      queryClient.invalidateQueries({ queryKey: ['role-services', payload.id_rol] })
      queryClient.invalidateQueries({ queryKey: ['role-activity', payload.id_rol] })
    },
  })
}

export function useAssignAllServices() {
  const queryClient = useQueryClient()
  const api = useSrsApiRequest<AssignAllServicesPayload, undefined, unknown>(SrsPhpPath.ROLES_SERVICES)

  return useMutation({
    mutationFn: async (payload: AssignAllServicesPayload) => {
      const raw = await api.post(payload)
      return assertSrsSuccess<{ roles: number; services: number }>(raw, 'Failed to assign services')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['role-services'] })
      queryClient.invalidateQueries({ queryKey: ['role-activity'] })
    },
  })
}
