'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'

import { RecurringRuleForm } from '@/components/expenses/recurring-rule-form'
import { FormDialog } from '@/components/layout/form-dialog'
import { useRecurringRule } from '@/hooks/use-recurring-rules'
import { useTranslation } from '@/lib/i18n/locale-context'

export type RecurringRuleTarget = { kind: 'new' } | { kind: 'edit'; id: number }

/**
 * Regla recurrente en modal: datos y dealers. Al crearla, el modal sigue abierto con la regla nueva para
 * cargarle los dealers. `target` null = cerrado.
 */
export function RecurringRuleDialog({
  target,
  onClose,
}: {
  target: RecurringRuleTarget | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [createdId, setCreatedId] = React.useState<number | null>(null)
  const targetKey = target ? (target.kind === 'edit' ? target.id : 'new') : null

  React.useEffect(() => {
    setCreatedId(null)
  }, [targetKey])

  const id = target?.kind === 'edit' ? target.id : createdId
  const rule = useRecurringRule(id)

  if (!target) return null

  if (id == null) {
    return <RecurringRuleForm key="new" onClose={onClose} onCreated={setCreatedId} />
  }

  if (!rule.data) {
    return (
      <FormDialog open onOpenChange={onClose} title={t('expenses.ruleTitle')}>
        {rule.error ? (
          <p className="text-sm text-destructive" role="alert">
            {rule.error.message}
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

  return <RecurringRuleForm key={rule.data.id} rule={rule.data} onClose={onClose} />
}
