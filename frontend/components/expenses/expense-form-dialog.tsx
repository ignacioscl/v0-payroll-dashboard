'use client'

import { Loader2 } from 'lucide-react'

import { ExpenseForm } from '@/components/expenses/expense-form'
import { FormDialog } from '@/components/layout/form-dialog'
import { useExpenseDetail } from '@/hooks/use-expenses-list'
import { useRecurringRule } from '@/hooks/use-recurring-rules'
import { canAssignExpenseToEmployee } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { fmtAmount, fmtYmd, rowAmount } from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'

/** `fromRuleId`: «Generate expense from this recurring expense», el alta precargada con esa regla. */
export type ExpenseFormTarget = { kind: 'new'; fromRuleId?: number } | { kind: 'edit'; id: number }

/** Add / Edit Expense en modal. `target` null = cerrado. */
export function ExpenseFormDialog({ target, onClose }: { target: ExpenseFormTarget | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { user, hasPermission } = useSrsMe()
  const canAssign = canAssignExpenseToEmployee(hasPermission, user?.isSystemAdmin)
  const editId = target?.kind === 'edit' ? target.id : null
  const ruleId = target?.kind === 'new' ? target.fromRuleId ?? null : null
  const detail = useExpenseDetail(editId)
  const rule = useRecurringRule(ruleId)

  if (!target) return null

  // Mientras carga el gasto o la regla: el modal con su título, para no abrir un formulario vacío.
  const pending = target.kind === 'edit' ? detail : ruleId ? rule : null
  if (pending && !pending.data) {
    return (
      <FormDialog open onOpenChange={onClose} title={target.kind === 'edit' ? t('expenses.editTitle') : t('expenses.addTitle')}>
        {pending.error ? (
          <p className="text-sm text-destructive" role="alert">
            {pending.error.message}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('common.loading')}
          </p>
        )}
      </FormDialog>
    )
  }

  if (target.kind === 'new') {
    return (
      <ExpenseForm
        title={t('expenses.addTitle')}
        fromRule={rule.data}
        canAssign={canAssign}
        userName={user?.nombre}
        onClose={onClose}
      />
    )
  }

  if (!detail.data) return null

  return (
    <ExpenseForm
      key={`${detail.data.kind}-${editId}`}
      title={t('expenses.editTitle')}
      description={`${detail.data.company.name} · ${fmtAmount(rowAmount(detail.data))} · ${fmtYmd(detail.data.ticketDate)}`}
      detail={detail.data}
      canAssign={canAssign}
      userName={user?.nombre}
      onClose={onClose}
    />
  )
}
