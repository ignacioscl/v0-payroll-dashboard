'use client'

import * as React from 'react'
import { Loader2, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useGenericTtkEmployees } from '@/hooks/use-generic-ttk'
import { fmtMoney, fmtNum } from '@/components/billing/generic-invoice-items'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { GenericTtkEmployeeRow } from '@/lib/srs-generic-invoices-api'

const EYEBROW =
  'text-[10.5px] font-semibold uppercase tracking-[0.085em] text-muted-foreground leading-none'

export function GenericTtkDialog({
  open,
  onOpenChange,
  idDealer,
  dateFrom,
  dateTo,
  includeStatementId,
  selectedIds,
  paidIds,
  onToggle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  idDealer: number | null
  dateFrom: string | null
  dateTo: string | null
  includeStatementId?: number
  selectedIds: Set<number>
  paidIds: Set<number>
  onToggle: (row: GenericTtkEmployeeRow, checked: boolean) => void
}) {
  const { t } = useTranslation()
  const [term, setTerm] = React.useState('')
  const query = useGenericTtkEmployees({
    idDealer,
    dateFrom,
    dateTo,
    includeStatementId,
    enabled: open,
  })

  React.useEffect(() => {
    if (!open) setTerm('')
  }, [open])

  const rows = query.data?.rows ?? []
  const totals = query.data?.totals
  const filtered = React.useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      const blob = `${row.nombreEmployee} ${row.rolName ?? ''} ${row.dptoName ?? ''}`.toLowerCase()
      return blob.includes(q)
    })
  }, [rows, term])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader className="px-1 pb-3">
          <DialogTitle className="text-[17px] font-semibold tracking-[-0.015em]">
            {t('invoices.generic.ttkTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('invoices.generic.ttkSearch')}
            className="h-9 bg-card pl-8"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {query.isLoading ? (
            <div className="flex h-28 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t('invoices.generic.ttkEmpty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead className={EYEBROW}>{t('invoices.generic.colItem')}</TableHead>
                  <TableHead className={`${EYEBROW} text-right`}>
                    {t('invoices.generic.ttkHours')}
                  </TableHead>
                  <TableHead className={`${EYEBROW} text-right`}>
                    {t('invoices.generic.ttkAmount')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const checked = selectedIds.has(row.idEmployee)
                  const paid = paidIds.has(row.idEmployee)
                  return (
                    <TableRow
                      key={row.idEmployee}
                      className={paid ? undefined : 'cursor-pointer'}
                      onClick={() => {
                        if (paid) return
                        onToggle(row, !checked)
                      }}
                    >
                      <TableCell className="w-10 pr-0">
                        <Checkbox
                          className="cursor-pointer"
                          checked={checked}
                          disabled={paid}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(value) => {
                            if (paid) return
                            onToggle(row, value === true)
                          }}
                          aria-label={row.nombreEmployee}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.nombreEmployee}</div>
                        <div className="text-xs text-muted-foreground">
                          {[row.rolName, row.dptoName].filter(Boolean).join(' / ') || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {fmtNum(row.hoursReg)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {fmtMoney(row.amountDealer)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">
            {totals
              ? t('invoices.generic.ttkFooter', {
                  employees: totals.employees,
                  hours: fmtNum(totals.hours),
                  amount: fmtMoney(totals.amountDealer),
                })
              : ''}
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X />
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
