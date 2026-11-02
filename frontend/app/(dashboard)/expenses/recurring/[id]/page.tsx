'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Repeat } from 'lucide-react'

import { RecurringDealersTable } from '@/components/expenses/recurring-dealers-table'
import { RecurringRuleForm } from '@/components/expenses/recurring-rule-form'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Button } from '@/components/ui/button'
import { useRecurringRule } from '@/hooks/use-recurring-rules'
import { canAccessExpenses, canAddExpenses } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useTranslation } from '@/lib/i18n/locale-context'

export default function RecurringRulePage() {
  const { t } = useTranslation()
  const params = useParams<{ id: string }>()
  const id = Number(params?.id)
  const { user, loading, hasPermission } = useSrsMe()
  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin)
  const canAdd = canAddExpenses(hasPermission, user?.isSystemAdmin)
  const rule = useRecurringRule(Number.isFinite(id) && id > 0 && canAccess ? id : null)

  if (loading) return null
  if (!canAccess) return <AccessDenied message={t('expenses.noAccess')} />

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeading
        title={rule.data?.description ?? t('expenses.ruleTitle')}
        subtitle={t('expenses.ruleTitle')}
        icon={<Repeat />}
        variant="violet"
        actions={
          <>
            {canAdd && rule.data ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/expenses/new?fromRule=${rule.data.id}`}>
                  <Plus className="size-4" />
                  {t('expenses.addExpenseFromRule')}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/expenses/recurring">
                <ArrowLeft className="size-4" />
                {t('expenses.back')}
              </Link>
            </Button>
          </>
        }
      />
      {rule.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('common.loading')}
        </p>
      ) : rule.error ? (
        <p className="text-sm text-destructive" role="alert">
          {rule.error.message}
        </p>
      ) : rule.data ? (
        <>
          <RecurringRuleForm rule={rule.data} />
          <RecurringDealersTable rule={rule.data} />
        </>
      ) : null}
    </div>
  )
}
