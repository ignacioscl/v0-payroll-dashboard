'use client'

import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'

import { RecurringRuleForm } from '@/components/expenses/recurring-rule-form'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Button } from '@/components/ui/button'
import { canAccessExpenses } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useTranslation } from '@/lib/i18n/locale-context'

export default function NewRecurringRulePage() {
  const { t } = useTranslation()
  const { user, loading, hasPermission } = useSrsMe()
  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin)

  if (loading) return null
  if (!canAccess) return <AccessDenied message={t('expenses.noAccess')} />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        title={t('expenses.newRuleTitle')}
        icon={<Plus />}
        variant="violet"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/expenses/recurring">
              <ArrowLeft className="size-4" />
              {t('expenses.back')}
            </Link>
          </Button>
        }
      />
      <RecurringRuleForm />
    </div>
  )
}
