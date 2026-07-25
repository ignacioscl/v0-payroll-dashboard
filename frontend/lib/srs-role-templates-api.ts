// Tipos = DTOs del backend NestJS (src/features/rol-template/dto/rol-template.dto). Datos REALES.

export type RoleTemplateType = 1 | 2

export interface RoleTemplateRow {
  id: number
  idCompaniaOwner: number
  tipo: RoleTemplateType
  nombre: string
  ponderacion: number | null
  estado: number
  cantRoles: number
  cantPerm: number
}

export interface RoleTemplateListResponse {
  data: RoleTemplateRow[]
  page: number
  pageSize: number
  total: number
  lastPage: number
}

export interface RoleTemplateListParams {
  /** 0-based. */
  page: number
  pageSize?: number
  type?: '1' | '2'
  estado?: '0' | '1'
  term?: string
}

export interface RoleTemplatePermission {
  id: number
  nombre: string
  description: string | null
  assigned: boolean
}

export interface RoleTemplatePermissionsResponse {
  idTemplate: number
  templateNombre: string
  tipo: number
  permissions: RoleTemplatePermission[]
  /** Child ROL ids whose ROL_ACCION_REL was replaced to match the template. */
  syncedRoleIds?: number[]
  syncedCount?: number
}

export interface SetRoleTemplatePermissionsPayload {
  idsRolAccion: number[]
}

export interface RoleTemplateChildRole {
  id: number
  nombre: string
  tipo: number
  estado: number
  idDealer: number | null
  dealerNombre: string | null
  cantPerm: number
}

export interface RoleTemplateRolesResponse {
  idTemplate: number
  results: RoleTemplateChildRole[]
}

export interface CreateRoleTemplatePayload {
  tipo: RoleTemplateType
  nombre: string
  ponderacion?: number | null
}

export interface UpdateRoleTemplatePayload {
  nombre?: string
  ponderacion?: number | null
  estado?: 0 | 1
}

export interface CreateRolesFromTemplatePayload {
  /** Required for external (tipo 2) templates. */
  idDealers?: number[]
}

export interface CreateRolesFromTemplateResult {
  idTemplate: number
  createdIds: number[]
}

const BASE_URL = '/api/srs-kpis/role-templates'

/** Nest's default `HttpException` body is `{ statusCode, message, error }`; `message` can be a string or array. */
async function parseNestErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] }
    if (Array.isArray(body.message)) return body.message.join(', ') || fallback
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  } catch {
    /* non-JSON body — fall back below */
  }
  return fallback
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    throw new Error(await parseNestErrorMessage(res, fallbackErrorMessage))
  }
  return res.json() as Promise<T>
}

function buildListQuery(params: RoleTemplateListParams): string {
  const qs = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize ?? 25),
  })
  if (params.type) qs.set('type', params.type)
  if (params.estado) qs.set('estado', params.estado)
  if (params.term) qs.set('term', params.term)
  return `?${qs.toString()}`
}

export async function fetchRoleTemplateList(
  params: RoleTemplateListParams,
): Promise<RoleTemplateListResponse> {
  return requestJson(
    `${BASE_URL}${buildListQuery(params)}`,
    { method: 'GET' },
    'Failed to load role templates',
  )
}

export async function fetchRoleTemplate(id: number): Promise<RoleTemplateRow> {
  return requestJson(`${BASE_URL}/${id}`, { method: 'GET' }, 'Failed to load role template')
}

export async function createRoleTemplate(
  payload: CreateRoleTemplatePayload,
): Promise<RoleTemplateRow> {
  return requestJson(
    BASE_URL,
    { method: 'POST', body: JSON.stringify(payload) },
    'Failed to create role template',
  )
}

export async function updateRoleTemplate(
  id: number,
  payload: UpdateRoleTemplatePayload,
): Promise<RoleTemplateRow> {
  return requestJson(
    `${BASE_URL}/${id}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    'Failed to update role template',
  )
}

export async function deleteRoleTemplate(id: number): Promise<{ id: number }> {
  return requestJson(`${BASE_URL}/${id}`, { method: 'DELETE' }, 'Failed to delete role template')
}

export async function fetchRoleTemplatePermissions(
  id: number,
): Promise<RoleTemplatePermissionsResponse> {
  return requestJson(
    `${BASE_URL}/${id}/permissions`,
    { method: 'GET' },
    'Failed to load permissions',
  )
}

export async function setRoleTemplatePermissions(
  id: number,
  payload: SetRoleTemplatePermissionsPayload,
): Promise<RoleTemplatePermissionsResponse> {
  return requestJson(
    `${BASE_URL}/${id}/permissions`,
    { method: 'PUT', body: JSON.stringify(payload) },
    'Failed to update permissions',
  )
}

export async function fetchRoleTemplateRoles(id: number): Promise<RoleTemplateRolesResponse> {
  return requestJson(`${BASE_URL}/${id}/roles`, { method: 'GET' }, 'Failed to load roles')
}

export interface RoleTemplateActivityRow {
  id: number
  action: string
  summary: string
  detailJson: Record<string, unknown> | null
  idAuthor: number
  authorNombre: string
  createdAt: string
}

export interface RoleTemplateActivityResponse {
  idTemplate: number
  results: RoleTemplateActivityRow[]
}

export async function fetchRoleTemplateActivity(
  id: number,
): Promise<RoleTemplateActivityResponse> {
  return requestJson(
    `${BASE_URL}/${id}/activity`,
    { method: 'GET' },
    'Failed to load activity',
  )
}

export async function createRolesFromTemplate(
  id: number,
  payload: CreateRolesFromTemplatePayload,
): Promise<CreateRolesFromTemplateResult> {
  return requestJson(
    `${BASE_URL}/${id}/roles`,
    { method: 'POST', body: JSON.stringify(payload) },
    'Failed to create roles',
  )
}

export async function deleteRoleTemplateRole(id: number, idRol: number): Promise<{ id: number }> {
  return requestJson(
    `${BASE_URL}/${id}/roles/${idRol}`,
    { method: 'DELETE' },
    'Failed to delete role',
  )
}

export async function setRoleTemplateRoleEstado(
  id: number,
  idRol: number,
  estado: 0 | 1,
): Promise<{ id: number; estado: number }> {
  return requestJson(
    `${BASE_URL}/${id}/roles/${idRol}/estado`,
    { method: 'PUT', body: JSON.stringify({ estado }) },
    'Failed to update role status',
  )
}
