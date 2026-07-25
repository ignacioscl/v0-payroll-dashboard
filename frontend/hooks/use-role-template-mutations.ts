'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createRoleTemplate,
  deleteRoleTemplate,
  updateRoleTemplate,
  type CreateRoleTemplatePayload,
  type RoleTemplateRow,
  type UpdateRoleTemplatePayload,
} from '@/lib/srs-role-templates-api'

function invalidateTemplatesList(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['role-templates-list'] })
  void queryClient.invalidateQueries({ queryKey: ['role-template-activity'] })
}

export function useCreateRoleTemplate() {
  const queryClient = useQueryClient()
  return useMutation<RoleTemplateRow, Error, CreateRoleTemplatePayload>({
    mutationFn: createRoleTemplate,
    onSuccess: () => invalidateTemplatesList(queryClient),
  })
}

export function useUpdateRoleTemplate() {
  const queryClient = useQueryClient()
  return useMutation<RoleTemplateRow, Error, { id: number; payload: UpdateRoleTemplatePayload }>({
    mutationFn: ({ id, payload }) => updateRoleTemplate(id, payload),
    onSuccess: () => invalidateTemplatesList(queryClient),
  })
}

export function useDeleteRoleTemplate() {
  const queryClient = useQueryClient()
  return useMutation<{ id: number }, Error, number>({
    mutationFn: deleteRoleTemplate,
    onSuccess: () => invalidateTemplatesList(queryClient),
  })
}
