'use client'

import { Badge } from '@/components/ui/badge'
import { fmtAmount } from '@/lib/expenses/expense-format'
import { reasonTexts } from '@/lib/expenses/expense-piecework-history'
import { formatUsDateTimeForExport } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { PieceworkHistoryEntry } from '@/lib/srs-expenses-api'

/**
 * Un cambio de una WO de una expense Piecework (T5b de plan-reunion-juan-18-11), como tarjeta del «Expense log» (va en
 * el log, no en Edit: Ignacio, 22/11): la WO y el servicio, cuándo, el motivo, el monto antes → después y quién.
 */
export function PieceworkHistoryCard({ entry: h }: { entry: PieceworkHistoryEntry }) {
  const { t } = useTranslation()
  return (
    <li className="rounded-md border border-border/80 bg-muted/20 px-3 py-2.5" data-testid="piecework-history-entry">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] font-normal">
          {t('expenses.colWorkOrder')} {h.nro}
        </Badge>
        {h.service ? (
          <Badge variant="outline" className="whitespace-normal text-left text-[10px] font-normal">
            {h.service}
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">{formatUsDateTimeForExport(h.createdAt) || h.createdAt}</span>
      </div>
      <ul className="mt-1.5 space-y-0.5 text-sm leading-snug">
        {reasonTexts(h.detail, h.reason, t).map((line, i) => (
          <li key={i} className="break-words">
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-sm tabular-nums">
        {h.oldAmount === null ? t('expenses.pieceworkHistoryNew') : fmtAmount(h.oldAmount)} → {fmtAmount(h.newAmount)}
        {h.oldDealer && h.oldDealer.id !== h.newDealer.id ? (
          <span className="text-muted-foreground">
            {' '}
            ({h.oldDealer.name} → {h.newDealer.name})
          </span>
        ) : null}
      </p>
      {h.changedBy ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {h.source === 'edit'
            ? t('expenses.logBy', { name: h.changedBy.name })
            : t('expenses.pieceworkHistoryWoChangedBy', {
                name: h.changedBy.name,
                date: formatUsDateTimeForExport(h.woChangedAt ?? '') || h.woChangedAt || '—',
              })}
        </p>
      ) : null}
    </li>
  )
}
