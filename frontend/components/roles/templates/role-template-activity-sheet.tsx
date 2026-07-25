'use client'

import { RoleActivitySheet } from '@/components/roles/activity/role-activity-sheet'
import { useRoleTemplateActivity } from '@/hooks/use-role-template-activity'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RoleTemplateRow } from '@/lib/srs-role-templates-api'

export type RoleTemplateActivitySheetProps = {
  template: RoleTemplateRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleTemplateActivitySheet({
  template,
  open,
  onOpenChange,
}: RoleTemplateActivitySheetProps) {
  const { t } = useTranslation()
  const id = template?.id ?? null
  const query = useRoleTemplateActivity(id, open && id != null)

  return (
    <RoleActivitySheet
      title={t('roleTemplates.activityTitle', { name: template?.nombre ?? '' })}
      subtitle={t('roleTemplates.activitySubtitle')}
      rows={query.data?.results ?? []}
      isLoading={query.isLoading}
      emptyMessage={t('roleTemplates.activityEmpty')}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}
