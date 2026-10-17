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
  idTemplate?: number | null
  templateNombre?: string | null
  /** false = internal role with no possible services (the menu hides «Services»). Only from roles-list. */
  hasServices?: boolean
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
  /** USUARIO_ROL_REL.id_dealer_asigned; null en los externos (el dealer es el del rol). */
  idDealerAsigned: number | null
  dealer: string
  /** Es el rol de PRO del usuario (id_rol_system_v2): no se le puede quitar. */
  isProRole: boolean
}

/** Una fila por asignación (el mismo usuario sale una vez por dealer). */
export type RoleUsersResponse = {
  idRol: number
  users: RoleUserRow[]
  /** Permiso 25 «Users > Create User» o administrador: muestra el tacho. */
  canRemove: boolean
}

export type RoleUserRemovePayload = {
  action: 'remove'
  id_rol: number
  id_usuario: number
  id_dealer_asigned: number | null
}

export type DepartmentOption = {
  id: number
  label: string
}

/** Services by role (legacy "Services & Prices Admin"), php/api/payroll/roles-services.php. */
export type RoleServiceRow = {
  idService: number
  dealer: string
  department: string
  service: string
  isCreateWo: boolean
  isApproveWo: boolean
}

export type RoleServicesResponse = {
  idRol: number
  services: RoleServiceRow[]
  /** Distinct users with the role (includes inactive), the set "apply to users" changes. */
  assignedUsers: number
  /** Why the list is empty when the role has no dealer/department or no provider. */
  reason: 'no_dealer' | 'no_provider' | null
}

export type RoleServiceColumn = 'create' | 'approve'

export type SetRoleServicesPayload = {
  action: 'set'
  id_rol: number
  ids_service: number[]
  type: RoleServiceColumn
  checked: boolean
  apply_users: boolean
}

export type AssignAllServicesPayload = {
  action: 'assign_all'
  ids_rol: number[]
  create: boolean
  approve: boolean
}
