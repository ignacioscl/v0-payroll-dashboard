'use client'

import { RoleActivitySheet } from '@/components/roles/activity/role-activity-sheet'
import { useRoleActivity } from '@/hooks/use-role-activity'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RoleListRow } from '@/lib/roles/roles-types'

export type RoleActivityPanelProps = {
  role: RoleListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleActivityPanel({ role, open, onOpenChange }: RoleActivityPanelProps) {
  const { t } = useTranslation()
  const id = role?.id ?? null
  const query = useRoleActivity(id, open && id != null)

  return (
    <RoleActivitySheet
      title={t('roles.activityTitle', { name: role?.nombre ?? '' })}
      subtitle={t('roles.activitySubtitle')}
      rows={query.data?.results ?? []}
      isLoading={query.isLoading}
      emptyMessage={t('roles.activityEmpty')}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}
