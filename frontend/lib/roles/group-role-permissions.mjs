/**
 * @typedef {{
 *   id: number,
 *   nombre: string,
 *   description: string,
 *   assigned: boolean
 * }} RolePermission
 *
 * @typedef {RolePermission & { displayName: string }} VisibleRolePermission
 *
 * @typedef {{
 *   key: string,
 *   label: string,
 *   permissions: VisibleRolePermission[]
 * }} RolePermissionGroup
 */

/**
 * Filtra y agrupa permisos sin alterar el orden recibido.
 *
 * @param {RolePermission[]} permissions
 * @param {string} searchTerm
 * @param {string} otherLabel
 * @returns {RolePermissionGroup[]}
 */
export function groupRolePermissions(permissions, searchTerm, otherLabel) {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase()
  /** @type {Map<string, RolePermissionGroup>} */
  const groups = new Map()

  for (const permission of permissions) {
    const searchableText = `${permission.nombre} ${permission.description}`.toLocaleLowerCase()
    if (normalizedSearch && !searchableText.includes(normalizedSearch)) {
      continue
    }

    const separatorIndex = permission.nombre.indexOf('>')
    const prefix =
      separatorIndex >= 0 ? permission.nombre.slice(0, separatorIndex).trim() : ''
    const suffix =
      separatorIndex >= 0 ? permission.nombre.slice(separatorIndex + 1).trim() : ''
    const isGrouped = prefix !== ''
    const key = isGrouped ? `prefix:${prefix}` : 'other'

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: isGrouped ? prefix : otherLabel,
        permissions: [],
      })
    }

    groups.get(key).permissions.push({
      ...permission,
      displayName: isGrouped && suffix !== '' ? suffix : permission.nombre,
    })
  }

  return Array.from(groups.values())
}
