'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'

import { ExpenseForm } from '@/components/expenses/expense-form'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Button } from '@/components/ui/button'
import { canAccessExpenses, canAddExpenses, canAssignExpenseToEmployee } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useTranslation } from '@/lib/i18n/locale-context'

function NewExpense() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const { user, loading, hasPermission } = useSrsMe()
  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin)
  const canAdd = canAddExpenses(hasPermission, user?.isSystemAdmin)
  const canAssign = canAssignExpenseToEmployee(hasPermission, user?.isSystemAdmin)
  const fromRule = Number(searchParams.get('fromRule'))

  if (loading) return null
  if (!canAccess || !canAdd) return <AccessDenied message={t('expenses.noAccess')} />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        title={t('expenses.addTitle')}
        icon={<Plus />}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/expenses">
              <ArrowLeft className="size-4" />
              {t('expenses.back')}
            </Link>
          </Button>
        }
      />
      <ExpenseForm
        fromRuleId={Number.isFinite(fromRule) && fromRule > 0 ? fromRule : null}
        canAssign={canAssign}
        userName={user?.nombre}
      />
    </div>
  )
}

export default function NewExpensePage() {
  return (
    <React.Suspense fallback={null}>
      <NewExpense />
    </React.Suspense>
  )
}
