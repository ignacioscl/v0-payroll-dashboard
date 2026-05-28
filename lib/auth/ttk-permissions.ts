/** Legacy ROL_ACCION ids (ttk_main / rolMaganer.userHavePermission). */
export const ROL_ACCION_ADD_EDIT_PUNCH = 67
export const ROL_ACCION_DELETE_PUNCH = 68

export function canAddOrEditPunch(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_ADD_EDIT_PUNCH)
}

export function canDeletePunch(
  hasPermission: (id: number) => boolean,
  isSystemAdmin?: boolean,
): boolean {
  return Boolean(isSystemAdmin) || hasPermission(ROL_ACCION_DELETE_PUNCH)
}
