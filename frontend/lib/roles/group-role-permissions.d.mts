import type { RolePermission } from './roles-types'

export type VisibleRolePermission = RolePermission & {
  displayName: string
}

export type RolePermissionGroup = {
  key: string
  label: string
  permissions: VisibleRolePermission[]
}

export function groupRolePermissions(
  permissions: RolePermission[],
  searchTerm: string,
  otherLabel: string,
): RolePermissionGroup[]
