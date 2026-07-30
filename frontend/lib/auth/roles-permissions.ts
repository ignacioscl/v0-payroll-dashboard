/** Legacy ROL_ACCION ids — Roles Admin. */
export const ROL_ACCION_ROLES_LIST = 42
export const ROL_ACCION_ROLES_EDIT = 43
export const ROL_ACCION_USERS_MODULE = 24
/** Roles Admin > Role Templates (SRS Nest API). */
export const ROL_ACCION_ROLE_TEMPLATES = 144

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

/**
 * Manage Role Templates — create/edit/delete templates, permissions and child roles.
 * Allowed: ROL_ACCION 144, Admin Company, or Admin General
 * (`isSystemAdmin` from me.php covers both legacy admins).
 */
export function canManageRoleTemplates(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_ROLE_TEMPLATES)
}
