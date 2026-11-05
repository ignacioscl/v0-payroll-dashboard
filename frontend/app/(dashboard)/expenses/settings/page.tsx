'use client'

import * as React from 'react'
import { Settings } from 'lucide-react'

import { SettingsCatalogTable } from '@/components/expenses/settings-catalog-table'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canAccessExpenses } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useTranslation } from '@/lib/i18n/locale-context'

export default function ExpensesSettingsPage() {
  const { t } = useTranslation()
  const { user, loading, hasPermission } = useSrsMe()
  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin, user?.hasExpenses)
  const [tab, setTab] = React.useState<'categories' | 'companies'>('categories')

  if (!loading && !canAccess) return <AccessDenied message={t('expenses.noAccess')} />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading title={t('expenses.settingsTitle')} subtitle={t('expenses.settingsSubtitle')} icon={<Settings />} variant="info" />
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'categories' | 'companies')} className="min-w-0 gap-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-fit">
          <TabsTrigger value="categories" className="cursor-pointer">
            {t('expenses.categories')}
          </TabsTrigger>
          <TabsTrigger value="companies" className="cursor-pointer">
            {t('expenses.companies')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="min-w-0">
          <SettingsCatalogTable kind="categories" enabled={!loading && canAccess && tab === 'categories'} />
        </TabsContent>
        <TabsContent value="companies" className="min-w-0">
          <SettingsCatalogTable kind="companies" enabled={!loading && canAccess && tab === 'companies'} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
