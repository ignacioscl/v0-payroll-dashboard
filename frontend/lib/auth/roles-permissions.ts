/** Legacy ROL_ACCION ids — Roles Admin. */
export const ROL_ACCION_ROLES_LIST = 42
export const ROL_ACCION_ROLES_EDIT = 43
export const ROL_ACCION_USERS_MODULE = 24

/** Enter Roles Admin + list/read permissions (`show-rol-action-42`). */
export function canViewRoles(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_ROLES_LIST)
}

/** Toggle permissions / CRUD roles (`show-rol-action-43`). */
export function canEditRoles(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_ROLES_EDIT)
}

/** View users with this role (`show-rol-action-24`). */
export function canViewRoleUsers(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_USERS_MODULE)
}
