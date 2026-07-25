'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchRoleActivity, type RoleActivityResponse } from '@/lib/srs-roles-api'

export function roleActivityQueryKey(idRol: number) {
  return ['role-activity', idRol] as const
}

export function useRoleActivity(idRol: number | null, enabled = true) {
  return useQuery<RoleActivityResponse>({
    queryKey: roleActivityQueryKey(idRol ?? 0),
    enabled: enabled && idRol != null && idRol > 0,
    queryFn: () => fetchRoleActivity(idRol as number),
  })
}
