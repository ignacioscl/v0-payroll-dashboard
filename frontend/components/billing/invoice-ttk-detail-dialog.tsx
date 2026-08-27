'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useInvoiceTtkDetail,
  type InvoiceTtkDetailRow,
} from '@/hooks/use-invoice-ttk-detail'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Hour amounts are quantities, not currency — no `$` sign. */
function fmtHours(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** MM/DD/YYYY (+ weekday) without `new Date(ymd)` UTC shift — same pattern as invoice-list-table. */
function fmtTtkDate(value: string | null | undefined, allPeriodLabel: string): string {
  if (!value) return allPeriodLabel
  const iso = value.length > 10 ? value.slice(0, 10) : value
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0)
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' })
  return `${m}/${d}/${y} (${weekday})`
}

function payrollPays(row: InvoiceTtkDetailRow): number {
  return (
    num(row.payHoursReg) +
    num(row.payHoursOt) +
    num(row.piecework) +
    num(row.salary) +
    num(row.commission) +
    num(row.flatRate) +
    num(row.dailyPay) +
    num(row.closing) +
    num(row.sunday) +
    num(row.extra) +
    num(row.shop) +
    num(row.halfDay) +
    num(row.overtime) +
    num(row.proratedDay)
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  className,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-2 py-1.5 tabular-nums',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function InvoiceTtkDetailDialog({
  open,
  onOpenChange,
  statementId,
  invoiceLabel,
  idBilling,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  statementId: number | null
  invoiceLabel: string
  idBilling?: number | null
}) {
  const { t } = useTranslation()
  const { data, isLoading, isError, error } = useInvoiceTtkDetail(
    statementId,
    open,
    idBilling,
  )
  const rows = data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-[min(96vw,72rem)]">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="text-base">{t('invoices.ttkDetailTitle')}</DialogTitle>
          <DialogDescription className="text-xs tabular-nums">{invoiceLabel}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto py-3">
          {isLoading ? (
            <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              {t('invoices.ttkDetailLoading')}
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : t('invoices.ttkDetailError')}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              {t('invoices.ttkDetailEmpty')}
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60">
              <table className="w-full min-w-[64rem] text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>{t('invoices.ttkColEmployee')}</Th>
                    <Th>{t('invoices.ttkColDptoRole')}</Th>
                    <Th>{t('invoices.ttkColDate')}</Th>
                    <Th align="right">{t('invoices.ttkColTotalHrs')}</Th>
                    <Th align="right">{t('invoices.ttkColHrs')}</Th>
                    <Th align="right">{t('invoices.ttkColHrsPay')}</Th>
                    <Th align="right">{t('invoices.ttkColOt')}</Th>
                    <Th align="right">{t('invoices.ttkColOtPay')}</Th>
                    <Th align="right">{t('invoices.ttkColPayroll')}</Th>
                    <Th align="right">{t('invoices.ttkColPayrollTaxes')}</Th>
                    <Th align="right">{t('invoices.ttkColTotalPayroll')}</Th>
                    <Th align="right">{t('invoices.ttkColDealerAmount')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const pays = payrollPays(row)
                    const taxes = num(row.payrollTaxes)
                    const rol =
                      row.rolDpto != null
                        ? [row.rolDpto.department, row.rolDpto.role]
                            .filter(Boolean)
                            .join(' / ')
                        : ''
                    return (
                      <tr
                        key={`${row.idTtk ?? row.id ?? 'row'}-${index}`}
                        className="border-t border-border/60"
                      >
                        <Td className="font-medium">{row.nombreEmployee || '—'}</Td>
                        <Td className="text-muted-foreground">{rol || '—'}</Td>
                        <Td>
                          {fmtTtkDate(row.fecha, t('invoices.ttkDateAllPeriod'))}
                        </Td>
                        <Td align="right">{fmtHours(num(row.hoursReg) + num(row.hoursOt))}</Td>
                        <Td align="right">{fmtHours(num(row.hoursReg))}</Td>
                        <Td align="right">{fmtMoney(num(row.payHoursReg))}</Td>
                        <Td align="right">{fmtHours(num(row.hoursOt))}</Td>
                        <Td align="right">{fmtMoney(num(row.payHoursOt))}</Td>
                        <Td align="right">{fmtMoney(pays)}</Td>
                        <Td align="right">{fmtMoney(taxes)}</Td>
                        <Td align="right">{fmtMoney(pays + taxes)}</Td>
                        <Td align="right">{fmtMoney(num(row.amountDealer))}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
