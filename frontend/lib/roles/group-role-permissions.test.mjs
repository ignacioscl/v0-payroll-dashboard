import test from 'node:test'
import assert from 'node:assert/strict'

let groupRolePermissions

try {
  ;({ groupRolePermissions } = await import('./group-role-permissions.mjs'))
} catch {
  groupRolePermissions = undefined
}

test('agrupa por el primer separador y conserva el orden', () => {
  assert.equal(typeof groupRolePermissions, 'function')

  const groups = groupRolePermissions(
    [
      { id: 1, nombre: 'Work Orders > View', description: '', assigned: false },
      { id: 2, nombre: 'Employees > Edit > Payroll', description: '', assigned: true },
      { id: 3, nombre: 'Standalone', description: '', assigned: false },
      { id: 4, nombre: 'Work Orders > Delete', description: '', assigned: false },
    ],
    '',
    'Other',
  )

  assert.deepEqual(
    groups.map((group) => ({
      label: group.label,
      permissions: group.permissions.map((permission) => permission.displayName),
    })),
    [
      { label: 'Work Orders', permissions: ['View', 'Delete'] },
      { label: 'Employees', permissions: ['Edit > Payroll'] },
      { label: 'Other', permissions: ['Standalone'] },
    ],
  )
})

test('filtra por nombre completo y descripción sin distinguir mayúsculas', () => {
  assert.equal(typeof groupRolePermissions, 'function')

  const permissions = [
    { id: 1, nombre: 'Work Orders > View', description: 'Read work orders', assigned: false },
    { id: 2, nombre: 'Employees > Edit', description: 'Manage staff', assigned: true },
  ]

  assert.deepEqual(groupRolePermissions(permissions, 'WORK ORDERS', 'Other').map((group) => group.label), [
    'Work Orders',
  ])
  assert.deepEqual(groupRolePermissions(permissions, 'staff', 'Other').map((group) => group.label), [
    'Employees',
  ])
  assert.deepEqual(groupRolePermissions(permissions, 'missing', 'Other'), [])
})
