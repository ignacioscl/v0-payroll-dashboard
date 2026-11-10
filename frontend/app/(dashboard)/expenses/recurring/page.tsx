'use client'

import * as React from 'react'
import { CalendarClock, Plus, Repeat, Sigma } from 'lucide-react'

import { KPICard } from '@/components/dashboard/kpi-card'
import { ExpenseFormDialog, type ExpenseFormTarget } from '@/components/expenses/expense-form-dialog'
import { RecurringRuleDialog, type RecurringRuleTarget } from '@/components/expenses/recurring-rule-dialog'
import { RecurringRulesDataTable } from '@/components/expenses/recurring-rules-data-table'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Button } from '@/components/ui/button'
import { canAccessExpenses, canAddExpenses } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { fmtAmount } from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RuleListResponse } from '@/lib/srs-expenses-api'

export default function RecurringExpensesPage() {
  const { t } = useTranslation()
  const { user, loading, hasPermission } = useSrsMe()
  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin, user?.hasExpenses)
  const canAdd = canAddExpenses(hasPermission, user?.isSystemAdmin)
  const [cards, setCards] = React.useState<RuleListResponse['cards'] | null>(null)
  const [ruleTarget, setRuleTarget] = React.useState<RecurringRuleTarget | null>(null)
  const [expenseTarget, setExpenseTarget] = React.useState<ExpenseFormTarget | null>(null)

  if (!loading && !canAccess) return <AccessDenied message={t('expenses.noAccess')} />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        title={t('expenses.recurringTitle')}
        subtitle={t('expenses.recurringSubtitle')}
        icon={<Repeat />}
        variant="violet"
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setRuleTarget({ kind: 'new' })}>
            <Plus className="size-4" />
            {t('expenses.addRule')}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPICard inline title={t('expenses.activeRules')} value={cards ? cards.activeRules.toLocaleString() : '—'} icon={<Repeat />} variant="violet" />
        <KPICard inline title={t('expenses.estimatedMonthly')} value={cards ? fmtAmount(cards.estimatedMonthly) : '—'} icon={<Sigma />} />
        <KPICard inline title={t('expenses.next30Days')} value={cards ? fmtAmount(cards.next30Days) : '—'} icon={<CalendarClock />} variant="info" />
      </div>
      <RecurringRulesDataTable
        enabled={!loading && canAccess}
        onCards={setCards}
        onEdit={(id) => setRuleTarget({ kind: 'edit', id })}
        onGenerateExpense={canAdd ? (ruleId) => setExpenseTarget({ kind: 'new', fromRuleId: ruleId }) : undefined}
      />
      <RecurringRuleDialog target={ruleTarget} onClose={() => setRuleTarget(null)} />
      <ExpenseFormDialog target={expenseTarget} onClose={() => setExpenseTarget(null)} />
    </div>
  )
}
