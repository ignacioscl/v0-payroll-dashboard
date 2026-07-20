'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import type { DepartmentOption, RoleUsersResponse } from '@/lib/roles/roles-types'
import { SrsPhpPath } from '@/types/enum-url'

export function useRoleDepartments(
  idDealer: number | null,
  idDealerProvider: number | null,
  enabled = true,
) {
  const api = useSrsApiRequest<unknown, Record<string, string | number>, unknown>(
    SrsPhpPath.ROLES_DEPARTMENTS,
  )

  return useQuery({
    queryKey: ['roles-departments', idDealer, idDealerProvider],
    enabled: enabled && idDealer != null && idDealer > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const raw = await api.getCustom('', undefined, {
        id_dealer: idDealer as number,
        ...(idDealerProvider && idDealerProvider > 0
          ? { id_dealer_provider: idDealerProvider }
          : {}),
      })
      const data = assertSrsSuccess<{ results: DepartmentOption[] }>(
        raw,
        'Failed to load departments',
      )
      return data.results
    },
  })
}

export function useRoleUsers(idRol: number | null, enabled = true) {
  const api = useSrsApiRequest<unknown, Record<string, string | number>, unknown>(
    SrsPhpPath.ROLES_USERS,
  )

  return useQuery({
    queryKey: ['roles-users', idRol],
    enabled: enabled && idRol != null && idRol > 0,
    queryFn: async () => {
      const raw = await api.getCustom('', undefined, { id_rol: idRol as number })
      return assertSrsSuccess<RoleUsersResponse>(raw, 'Failed to load users')
    },
  })
}
