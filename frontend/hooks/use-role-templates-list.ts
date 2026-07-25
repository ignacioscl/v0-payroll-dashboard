'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  fetchRoleTemplateList,
  type RoleTemplateListParams,
  type RoleTemplateListResponse,
} from '@/lib/srs-role-templates-api'

export function useRoleTemplatesList(params: RoleTemplateListParams, enabled = true) {
  return useQuery<RoleTemplateListResponse>({
    queryKey: ['role-templates-list', params],
    queryFn: () => fetchRoleTemplateList(params),
    enabled,
    placeholderData: keepPreviousData,
  })
}
