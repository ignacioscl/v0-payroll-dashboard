'use client'

import { useCallback, useState } from 'react'
import { Plus, Shield } from 'lucide-react'

import { PageHeading } from '@/components/layout/page-heading'
import { AccessDenied } from '@/components/layout/access-denied'
import { AccessLevelDialog } from '@/components/roles/access-level-dialog'
import { RoleActivityPanel } from '@/components/roles/role-activity-panel'
import { RoleFormDialog } from '@/components/roles/role-form-dialog'
import { RolePermissionsSheet } from '@/components/roles/role-permissions-sheet'
import {
  RoleTemplateFilterCombobox,
  type RoleTemplateFilterOption,
} from '@/components/roles/role-template-filter-combobox'
import { RoleUsersSheet } from '@/components/roles/role-users-sheet'
import { RolesDataTable } from '@/components/roles/roles-data-table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import {
  canEditRoles,
  canViewRoleUsers,
  canViewRoles,
} from '@/lib/auth/roles-permissions'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RoleListRow } from '@/lib/roles/roles-types'

export default function RolesPage() {
  const { t } = useTranslation()
  const { user, loading, hasPermission } = useSrsMe()

  const canView = canViewRoles(hasPermission, user?.isSystemAdmin)
  const canEdit = canEditRoles(hasPermission, user?.isSystemAdmin)
  const canViewUsers = canViewRoleUsers(hasPermission, user?.isSystemAdmin)

  const [typeFilter, setTypeFilter] = useState('')
  const [templateFilter, setTemplateFilter] = useState<RoleTemplateFilterOption | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [permRole, setPermRole] = useState<RoleListRow | null>(null)
  const [permOpen, setPermOpen] = useState(false)
  const [formRole, setFormRole] = useState<RoleListRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pondRole, setPondRole] = useState<RoleListRow | null>(null)
  const [pondOpen, setPondOpen] = useState(false)
  const [usersRole, setUsersRole] = useState<RoleListRow | null>(null)
  const [usersOpen, setUsersOpen] = useState(false)
  const [activityRole, setActivityRole] = useState<RoleListRow | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)

  const onOpenPermissions = useCallback((role: RoleListRow) => {
    setPermRole(role)
    setPermOpen(true)
  }, [])

  const onEdit = useCallback((role: RoleListRow) => {
    if (role.idTemplate) return
    setFormRole(role)
    setFormOpen(true)
  }, [])

  const onAdd = useCallback(() => {
    setFormRole(null)
    setFormOpen(true)
  }, [])

  const onAccessLevel = useCallback((role: RoleListRow) => {
    if (role.idTemplate) return
    setPondRole(role)
    setPondOpen(true)
  }, [])

  const onViewUsers = useCallback((role: RoleListRow) => {
    setUsersRole(role)
    setUsersOpen(true)
  }, [])

  const onViewActivity = useCallback((role: RoleListRow) => {
    if (role.idTemplate) return
    setActivityRole(role)
    setActivityOpen(true)
  }, [])

  if (!loading && !canView) {
    return <AccessDenied message={t('roles.noAccess')} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <PageHeading
        icon={<Shield className="size-5 text-white" />}
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        actions={
          canEdit ? (
            <Button type="button" size="sm" className="gap-1.5" onClick={onAdd}>
              <Plus className="size-4" />
              {t('roles.addRole')}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-[180px] space-y-1.5">
          <Label htmlFor="roles-type">{t('roles.type')}</Label>
          <Select
            value={typeFilter || 'all'}
            onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}
          >
            <SelectTrigger id="roles-type" className="h-9">
              <SelectValue placeholder={t('roles.typeAll')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('roles.typeAll')}</SelectItem>
              <SelectItem value="1">{t('roles.typeInternal')}</SelectItem>
              <SelectItem value="2">{t('roles.typeExternal')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[280px] space-y-1.5">
          <Label>{t('roles.basedOnFilter')}</Label>
          <RoleTemplateFilterCombobox
            value={templateFilter}
            onChange={setTemplateFilter}
            enabled={!loading && canView}
          />
        </div>

        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="roles-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="roles-inactive" className="text-sm font-normal">
            {t('roles.showInactive')}
          </Label>
        </div>
      </div>

      <RolesDataTable
        typeFilter={typeFilter}
        idTemplate={templateFilter?.id ?? null}
        showInactive={showInactive}
        enabled={!loading && canView}
        canEdit={canEdit}
        canViewUsers={canViewUsers}
        onOpenPermissions={onOpenPermissions}
        onEdit={onEdit}
        onAccessLevel={onAccessLevel}
        onViewUsers={onViewUsers}
        onViewActivity={onViewActivity}
      />

      <RolePermissionsSheet
        role={permRole}
        open={permOpen}
        onOpenChange={setPermOpen}
        canEdit={canEdit && !permRole?.idTemplate}
      />

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={formRole}
        isCompanyTypeCompany={Boolean(user?.isCompanyTypeCompany)}
        loggedDealerId={user?.idDealer ?? null}
      />

      <AccessLevelDialog open={pondOpen} onOpenChange={setPondOpen} role={pondRole} />

      <RoleUsersSheet role={usersRole} open={usersOpen} onOpenChange={setUsersOpen} />

      <RoleActivityPanel
        role={activityRole}
        open={activityOpen}
        onOpenChange={setActivityOpen}
      />
    </div>
  )
}
