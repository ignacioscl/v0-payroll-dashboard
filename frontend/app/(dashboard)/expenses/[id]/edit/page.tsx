'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, Pencil } from 'lucide-react'

import { ExpenseForm } from '@/components/expenses/expense-form'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Button } from '@/components/ui/button'
import { useExpenseDetail } from '@/hooks/use-expenses-list'
import { canAccessExpenses, canAssignExpenseToEmployee, canEditExpenses } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { fmtAmount, fmtYmd, rowAmount } from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'

export default function EditExpensePage() {
  const { t } = useTranslation()
  const params = useParams<{ id: string }>()
  const id = Number(params?.id)
  const { user, loading, hasPermission } = useSrsMe()
  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin)
  const canEdit = canEditExpenses(hasPermission, user?.isSystemAdmin)
  const canAssign = canAssignExpenseToEmployee(hasPermission, user?.isSystemAdmin)
  const detail = useExpenseDetail(Number.isFinite(id) && id > 0 && canAccess && canEdit ? id : null)

  if (loading) return null
  if (!canAccess || !canEdit) return <AccessDenied message={t('expenses.noAccess')} />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        title={t('expenses.editTitle')}
        subtitle={
          detail.data ? `${detail.data.company.name} · ${fmtAmount(rowAmount(detail.data))} · ${fmtYmd(detail.data.ticketDate)}` : undefined
        }
        icon={<Pencil />}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/expenses">
              <ArrowLeft className="size-4" />
              {t('expenses.back')}
            </Link>
          </Button>
        }
      />
      {detail.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('common.loading')}
        </p>
      ) : detail.error ? (
        <p className="text-sm text-destructive" role="alert">
          {detail.error.message}
        </p>
      ) : detail.data ? (
        <ExpenseForm key={`${detail.data.kind}-${id}`} detail={detail.data} canAssign={canAssign} userName={user?.nombre} />
      ) : null}
    </div>
  )
}
