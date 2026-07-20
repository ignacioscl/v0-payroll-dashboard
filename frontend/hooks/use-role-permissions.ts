'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import type { RolePermissionsResponse } from '@/lib/roles/roles-types'
import { SrsPhpPath } from '@/types/enum-url'

export function useRolePermissions(idRol: number | null, enabled = true) {
  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    unknown
  >(SrsPhpPath.ROLES_PERMISSIONS)

  return useQuery({
    queryKey: ['role-permissions', idRol],
    enabled: enabled && idRol != null && idRol > 0,
    staleTime: 5_000,
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, { id_rol: idRol as number })
      return assertSrsSuccess<RolePermissionsResponse>(raw, 'Failed to load permissions')
    },
  })
}
