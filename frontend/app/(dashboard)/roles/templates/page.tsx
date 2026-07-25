'use client'

import { useCallback, useState } from 'react'
import { Layers, Plus } from 'lucide-react'

import { PageHeading } from '@/components/layout/page-heading'
import { AccessDenied } from '@/components/layout/access-denied'
import { RoleTemplateActivitySheet } from '@/components/roles/templates/role-template-activity-sheet'
import { RoleTemplateFormDialog } from '@/components/roles/templates/role-template-form-dialog'
import { RoleTemplatePermissionsSheet } from '@/components/roles/templates/role-template-permissions-sheet'
import { RoleTemplateRolesSheet } from '@/components/roles/templates/role-template-roles-sheet'
import { RoleTemplatesDataTable } from '@/components/roles/templates/role-templates-data-table'
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
import { canManageRoleTemplates } from '@/lib/auth/roles-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RoleTemplateRow } from '@/lib/srs-role-templates-api'

export default function RoleTemplatesPage() {
  const { t } = useTranslation()
  const { user, loading, hasPermission } = useSrsMe()
  const canManage = canManageRoleTemplates(hasPermission, user?.isSystemAdmin)

  const [typeFilter, setTypeFilter] = useState<'all' | '1' | '2'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formTemplate, setFormTemplate] = useState<RoleTemplateRow | null>(null)
  const [permOpen, setPermOpen] = useState(false)
  const [permTemplate, setPermTemplate] = useState<RoleTemplateRow | null>(null)
  const [rolesOpen, setRolesOpen] = useState(false)
  const [rolesTemplate, setRolesTemplate] = useState<RoleTemplateRow | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [activityTemplate, setActivityTemplate] = useState<RoleTemplateRow | null>(null)

  const onAdd = useCallback(() => {
    setFormTemplate(null)
    setFormOpen(true)
  }, [])

  const onEdit = useCallback((row: RoleTemplateRow) => {
    setFormTemplate(row)
    setFormOpen(true)
  }, [])

  const onPermissions = useCallback((row: RoleTemplateRow) => {
    setPermTemplate(row)
    setPermOpen(true)
  }, [])

  const onRoles = useCallback((row: RoleTemplateRow) => {
    setRolesTemplate(row)
    setRolesOpen(true)
  }, [])

  const onActivity = useCallback((row: RoleTemplateRow) => {
    setActivityTemplate(row)
    setActivityOpen(true)
  }, [])

  if (!loading && !canManage) {
    return <AccessDenied message={t('roleTemplates.noAccess')} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title={t('roleTemplates.title')}
        subtitle={t('roleTemplates.subtitle')}
        icon={<Layers className="size-5 text-white" />}
        actions={
          <Button type="button" size="sm" className="gap-1.5 cursor-pointer" onClick={onAdd}>
            <Plus className="size-4" />
            {t('roleTemplates.add')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="rt-type-filter" className="text-sm text-muted-foreground">
            {t('roleTemplates.type')}
          </Label>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as 'all' | '1' | '2')}
          >
            <SelectTrigger id="rt-type-filter" className="w-[160px] cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="cursor-pointer">
                {t('roleTemplates.typeAll')}
              </SelectItem>
              <SelectItem value="1" className="cursor-pointer">
                {t('roleTemplates.typeInternal')}
              </SelectItem>
              <SelectItem value="2" className="cursor-pointer">
                {t('roleTemplates.typeExternal')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="rt-show-inactive"
            checked={showInactive}
            className="cursor-pointer"
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="rt-show-inactive" className="cursor-pointer text-sm">
            {t('roleTemplates.showInactive')}
          </Label>
        </div>
      </div>

      <RoleTemplatesDataTable
        typeFilter={typeFilter}
        showInactive={showInactive}
        enabled={!loading && canManage}
        onOpenPermissions={onPermissions}
        onEdit={onEdit}
        onOpenRoles={onRoles}
        onOpenActivity={onActivity}
      />

      <RoleTemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={formTemplate}
      />
      <RoleTemplatePermissionsSheet
        open={permOpen}
        onOpenChange={setPermOpen}
        template={permTemplate}
      />
      <RoleTemplateRolesSheet
        open={rolesOpen}
        onOpenChange={setRolesOpen}
        template={rolesTemplate}
      />
      <RoleTemplateActivitySheet
        open={activityOpen}
        onOpenChange={setActivityOpen}
        template={activityTemplate}
      />
    </div>
  )
}
