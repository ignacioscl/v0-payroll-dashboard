'use client'

import * as React from 'react'
import Link from 'next/link'
import { CalendarClock, Plus, Repeat, Sigma } from 'lucide-react'

import { KPICard } from '@/components/dashboard/kpi-card'
import { RecurringRulesDataTable } from '@/components/expenses/recurring-rules-data-table'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Button } from '@/components/ui/button'
import { canAccessExpenses } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { fmtAmount } from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RuleListResponse } from '@/lib/srs-expenses-api'

export default function RecurringExpensesPage() {
  const { t } = useTranslation()
  const { user, loading, hasPermission } = useSrsMe()
  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin)
  const [cards, setCards] = React.useState<RuleListResponse['cards'] | null>(null)

  if (!loading && !canAccess) return <AccessDenied message={t('expenses.noAccess')} />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        title={t('expenses.recurringTitle')}
        subtitle={t('expenses.recurringSubtitle')}
        icon={<Repeat />}
        variant="violet"
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/expenses/recurring/new">
              <Plus className="size-4" />
              {t('expenses.addRule')}
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPICard inline title={t('expenses.activeRules')} value={cards ? cards.activeRules.toLocaleString() : '—'} icon={<Repeat />} variant="violet" />
        <KPICard inline title={t('expenses.estimatedMonthly')} value={cards ? fmtAmount(cards.estimatedMonthly) : '—'} icon={<Sigma />} />
        <KPICard inline title={t('expenses.next30Days')} value={cards ? fmtAmount(cards.next30Days) : '—'} icon={<CalendarClock />} variant="info" />
      </div>
      <RecurringRulesDataTable enabled={!loading && canAccess} onCards={setCards} />
    </div>
  )
}
