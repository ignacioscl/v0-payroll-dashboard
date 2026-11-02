'use client'

import * as React from 'react'
import { Check, Loader2, Repeat, X } from 'lucide-react'
import { toast } from 'sonner'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRecurringRulesSearch } from '@/hooks/use-recurring-rules'
import { fmtAmount, splitLabel } from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fetchRule, type RuleDetail, type RuleRow } from '@/lib/srs-expenses-api'

/** «Use a recurring expense's split»: elige una regla de la empresa y devuelve su detalle (F3). */
export function RecurringRulePickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (rule: RuleDetail) => void
}) {
  const { t } = useTranslation()
  const [term, setTerm] = React.useState('')
  const [selected, setSelected] = React.useState<RuleRow | null>(null)
  const [loading, setLoading] = React.useState(false)
  const query = useRecurringRulesSearch(term, open)

  React.useEffect(() => {
    if (!open) {
      setSelected(null)
      setTerm('')
    }
  }, [open])

  const apply = async () => {
    if (!selected) return
    setLoading(true)
    try {
      const rule = await fetchRule(selected.id)
      onPick(rule)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="size-4" aria-hidden />
            {t('expenses.useRecurringSplit')}
          </DialogTitle>
          <DialogDescription>{t('expenses.useRecurringSplitHint')}</DialogDescription>
        </DialogHeader>
        <SearchableCombobox<RuleRow>
          value={selected}
          onChange={setSelected}
          searchTerm={term}
          onSearchTermChange={setTerm}
          items={query.data}
          isLoading={query.isLoading}
          getItemKey={(r) => r.id}
          getItemLabel={(r) => r.description}
          placeholder={t('expenses.pickRule')}
          showFooterHint={false}
          renderItem={({ item }) => (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{item.description}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {item.company.name} · {splitLabel(t, item.splitType)} · {fmtAmount(item.amount)} · {item.dealersCount}{' '}
                {t('expenses.dealers').toLowerCase()}
              </span>
            </span>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            <X className="size-4" />
            {t('expenses.cancel')}
          </Button>
          <Button type="button" onClick={() => void apply()} disabled={!selected || loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t('expenses.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
