/** Types for v0 Roles Admin. */

export type RoleListRow = {
  id: number
  nombre: string
  tipo: number | null
  tipoTxt: string
  estado: number
  ponderacion: number | null
  cantPerm: number
  departmentNombre: string
  idDepartment?: number | null
  idDealer?: number | null
  dealerText: string
  companyTxt: string
}

export type RolesListResponse = {
  results: RoleListRow[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export type RolePermission = {
  id: number
  nombre: string
  description: string
  assigned: boolean
}

export type RolePermissionsResponse = {
  idRol: number
  rolNombre: string
  tipo: number | null
  permissions: RolePermission[]
}

export type SetRolePermissionPayload = {
  id_rol: number
  ids_rol_accion: number[]
  checked: boolean
}

export type SetRolePermissionResult = {
  idRol: number
  checked: boolean
  ids: number[]
  cantPerm: number
}

export type RoleSavePayload = {
  id_rol?: number
  type?: number
  id_dealer?: number | null
  id_department?: number | null
  role: string
  ponderation?: number | null
  estado?: number
}

export type RoleActionPayload = {
  id_rol: number
  action: 'inactivate' | 'activate' | 'delete' | 'access_level'
  ponderation?: number
}

export type RoleUserRow = {
  id: number
  nombre: string
  email: string
  codigoInterno: string
}

export type RoleUsersResponse = {
  idRol: number
  users: RoleUserRow[]
}

export type DepartmentOption = {
  id: number
  label: string
}
