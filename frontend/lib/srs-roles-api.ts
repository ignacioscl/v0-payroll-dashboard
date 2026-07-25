import type { SetRolePermissionPayload, SetRolePermissionResult } from '@/lib/roles/roles-types'

export type RoleActivityRow = {
  id: number
  action: string
  summary: string
  detailJson: Record<string, unknown> | null
  idAuthor: number
  authorNombre: string
  createdAt: string
}

export type RoleActivityResponse = {
  idRol: number
  results: RoleActivityRow[]
}

const BASE_URL = '/api/srs-kpis/roles'

async function requestJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    try {
      const body = (await response.json()) as { message?: string | string[] }
      if (Array.isArray(body.message) && body.message.length) throw new Error(body.message.join(', '))
      if (typeof body.message === 'string' && body.message.trim()) throw new Error(body.message)
    } catch (error) {
      if (error instanceof Error && error.message !== fallback) throw error
    }
    throw new Error(fallback)
  }
  return response.json() as Promise<T>
}

export function setRolePermissions(
  payload: SetRolePermissionPayload,
): Promise<SetRolePermissionResult> {
  return requestJson(
    `${BASE_URL}/${payload.id_rol}/permissions`,
    {
      method: 'POST',
      body: JSON.stringify({
        idsRolAccion: payload.ids_rol_accion,
        checked: payload.checked,
      }),
    },
    'Failed to update permission',
  )
}

export function fetchRoleActivity(idRol: number): Promise<RoleActivityResponse> {
  return requestJson(`${BASE_URL}/${idRol}/activity`, { method: 'GET' }, 'Failed to load activity')
}
