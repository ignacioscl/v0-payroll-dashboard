'use client'

import { useQuery } from '@tanstack/react-query'

import {
  fetchRoleTemplateActivity,
  type RoleTemplateActivityResponse,
} from '@/lib/srs-role-templates-api'

export function roleTemplateActivityQueryKey(idTemplate: number) {
  return ['role-template-activity', idTemplate] as const
}

export function useRoleTemplateActivity(idTemplate: number | null, enabled = true) {
  return useQuery<RoleTemplateActivityResponse>({
    queryKey: roleTemplateActivityQueryKey(idTemplate ?? 0),
    enabled: enabled && idTemplate != null && idTemplate > 0,
    queryFn: () => fetchRoleTemplateActivity(idTemplate as number),
  })
}
