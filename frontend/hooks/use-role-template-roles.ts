'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createRolesFromTemplate,
  deleteRoleTemplateRole,
  fetchRoleTemplateRoles,
  setRoleTemplateRoleEstado,
  type CreateRolesFromTemplatePayload,
  type CreateRolesFromTemplateResult,
  type RoleTemplateRolesResponse,
} from '@/lib/srs-role-templates-api'

export function roleTemplateRolesQueryKey(idTemplate: number) {
  return ['role-template-roles', idTemplate] as const
}

export function useRoleTemplateRoles(idTemplate: number | null, enabled = true) {
  return useQuery<RoleTemplateRolesResponse>({
    queryKey: roleTemplateRolesQueryKey(idTemplate ?? 0),
    enabled: enabled && idTemplate != null && idTemplate > 0,
    queryFn: () => fetchRoleTemplateRoles(idTemplate as number),
  })
}

function invalidateRoles(queryClient: ReturnType<typeof useQueryClient>, idTemplate: number) {
  void queryClient.invalidateQueries({ queryKey: roleTemplateRolesQueryKey(idTemplate) })
  void queryClient.invalidateQueries({ queryKey: ['role-templates-list'] })
}

export function useCreateRolesFromTemplate() {
  const queryClient = useQueryClient()
  return useMutation<
    CreateRolesFromTemplateResult,
    Error,
    { id: number; payload: CreateRolesFromTemplatePayload }
  >({
    mutationFn: ({ id, payload }) => createRolesFromTemplate(id, payload),
    onSuccess: (_data, vars) => invalidateRoles(queryClient, vars.id),
  })
}

export function useDeleteRoleTemplateRole() {
  const queryClient = useQueryClient()
  return useMutation<{ id: number }, Error, { id: number; idRol: number }>({
    mutationFn: ({ id, idRol }) => deleteRoleTemplateRole(id, idRol),
    onSuccess: (_data, vars) => invalidateRoles(queryClient, vars.id),
  })
}

export function useSetRoleTemplateRoleEstado() {
  const queryClient = useQueryClient()
  return useMutation<
    { id: number; estado: number },
    Error,
    { id: number; idRol: number; estado: 0 | 1 }
  >({
    mutationFn: ({ id, idRol, estado }) => setRoleTemplateRoleEstado(id, idRol, estado),
    onSuccess: (_data, vars) => invalidateRoles(queryClient, vars.id),
  })
}
