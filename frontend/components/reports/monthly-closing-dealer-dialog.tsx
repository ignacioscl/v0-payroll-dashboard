'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { X } from 'lucide-react'
import {
  DATA_TABLE_PAGE_SIZE_ALL,
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fmtMoney } from '@/lib/kpi-money'
import { closingMonthLabel } from '@/lib/reports/monthly-closing-month'
import {
  fetchMonthlyClosingDealer,
  type ClosingExpenseLine,
  type ClosingIncomeLine,
  type ClosingPayrollLine,
  type MonthlyClosingQueryParams,
} from '@/lib/srs-kpis-api'

type Tab = 'income' | 'payroll' | 'expenses'

/** Suma en centavos enteros, como el backend: el total de la solapa = la columna de la fila. */
function sumCents(amounts: number[]): number {
  return amounts.reduce((acc, n) => acc + Math.round(n * 100), 0) / 100
}

export type MonthlyClosingDealerDialogProps = {
  /** Dealer de la fila; `0` = Without dealer (solo la solapa Payroll). `null` = cerrado. */
  dealer: { dealerId: number; dealer: string } | null
  onClose: () => void
  params: MonthlyClosingQueryParams
}

/** Columna de texto que en celular va en varias líneas (regla de tablas en celular: nada cortado con «…»). */
function textColumn<T>(key: keyof T & string, title: string, size?: number): ColumnDef<T> {
  return {
    accessorKey: key,
    size,
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ row }) => <span className="whitespace-normal break-words">{String(row.original[key] ?? '')}</span>,
    meta: { label: title } satisfies DataTableColumnMeta<T>,
  }
}

function dateColumn<T>(key: keyof T & string, title: string): ColumnDef<T> {
  return {
    accessorKey: key,
    size: 110,
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ row }) => <span className="tabular-nums">{formatUsCalendarDate(String(row.original[key] ?? ''))}</span>,
    meta: { label: title } satisfies DataTableColumnMeta<T>,
  }
}

function moneyColumn<T>(key: keyof T & string, title: string): ColumnDef<T> {
  return {
    accessorKey: key,
    size: 130,
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ row }) => fmtMoney(Number(row.original[key] ?? 0)),
    meta: { label: title, numeric: true, money: true } satisfies DataTableColumnMeta<T>,
  }
}

/**
 * Detalle de un dealer del Monthly Closing (MC §5.4.3) y del Window Tint Closing (tint §5.2): Income, Payroll y
 * Expenses del mes, cada solapa suma la columna de la fila. Precedente: dealers-ranking-dialog.tsx.
 */
export function MonthlyClosingDealerDialog({ dealer, onClose, params }: MonthlyClosingDealerDialogProps) {
  const { t } = useTranslation()
  const withoutDealer = dealer?.dealerId === 0
  const [tab, setTab] = React.useState<Tab>('income')
  React.useEffect(() => {
    setTab(withoutDealer ? 'payroll' : 'income')
  }, [dealer?.dealerId, withoutDealer])

  const detail = useQuery({
    queryKey: ['srs-report', 'monthly-closing-dealer', dealer?.dealerId ?? null, params],
    queryFn: () => fetchMonthlyClosingDealer(dealer!.dealerId, params),
    enabled: dealer != null,
  })
  const tint = params.scope === 'tint'

  const incomeColumns = React.useMemo<ColumnDef<ClosingIncomeLine>[]>(
    () => [
      textColumn<ClosingIncomeLine>('nro', t('monthlyClosing.colInvoice'), 130),
      dateColumn<ClosingIncomeLine>('dateFrom', t('monthlyClosing.colDateFrom')),
      dateColumn<ClosingIncomeLine>('dateTo', t('monthlyClosing.colDateTo')),
      textColumn<ClosingIncomeLine>('department', t('monthlyClosing.colDepartment'), 160),
      textColumn<ClosingIncomeLine>('service', t('monthlyClosing.colService'), 240),
      ...(tint
        ? [
            {
              accessorKey: 'qty',
              size: 70,
              header: ({ column }) => <DataTableColumnHeader column={column} title={t('monthlyClosing.colQty')} />,
              cell: ({ row }) => row.original.qty.toLocaleString(),
              meta: { label: t('monthlyClosing.colQty'), numeric: true } satisfies DataTableColumnMeta<ClosingIncomeLine>,
            } as ColumnDef<ClosingIncomeLine>,
          ]
        : []),
      moneyColumn<ClosingIncomeLine>('total', t('monthlyClosing.colTotal')),
    ],
    [t, tint],
  )

  const payrollColumns = React.useMemo<ColumnDef<ClosingPayrollLine>[]>(
    () => [
      {
        id: 'period',
        accessorFn: (r) => r.periodDesde,
        size: 190,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('monthlyClosing.colPayPeriod')} />,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatUsCalendarDate(row.original.periodDesde)} – {formatUsCalendarDate(row.original.periodHasta)}
          </span>
        ),
        meta: { label: t('monthlyClosing.colPayPeriod') } satisfies DataTableColumnMeta<ClosingPayrollLine>,
      },
      textColumn<ClosingPayrollLine>('employee', t('monthlyClosing.colEmployee'), 240),
      textColumn<ClosingPayrollLine>('position', t('monthlyClosing.colPosition'), 160),
      moneyColumn<ClosingPayrollLine>('amount', t('monthlyClosing.colAmount')),
    ],
    [t],
  )

  const expenseColumns = React.useMemo<ColumnDef<ClosingExpenseLine>[]>(
    () => [
      dateColumn<ClosingExpenseLine>('date', t('monthlyClosing.colDate')),
      textColumn<ClosingExpenseLine>('vendor', t('monthlyClosing.colVendor'), 200),
      textColumn<ClosingExpenseLine>('category', t('monthlyClosing.colCategory'), 160),
      moneyColumn<ClosingExpenseLine>('amount', t('monthlyClosing.colAmount')),
      textColumn<ClosingExpenseLine>('notes', t('monthlyClosing.colNotes'), 240),
    ],
    [t],
  )

  const data = detail.data
  const totalBar = (amount: number) => (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm font-semibold">
      <span>{t('monthlyClosing.total')}</span>
      <span className="tabular-nums">{fmtMoney(amount)}</span>
    </div>
  )
  const empty = (key: 'emptyIncome' | 'emptyPayroll' | 'emptyExpenses') => (
    <p className="py-8 text-center text-sm text-muted-foreground">{t(`monthlyClosing.${key}`)}</p>
  )
  const tableProps = {
    isLoading: detail.isFetching,
    defaultPageSize: DATA_TABLE_PAGE_SIZE_ALL,
    includeAllPageSize: true,
    tableScrollHeight: '50vh',
    enableExport: false,
    enableGlobalFilter: false,
    enableViewOptions: false,
  } as const

  return (
    <Dialog open={dealer != null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto sm:max-w-[min(96vw,64rem)]">
        <DialogHeader className="pr-8">
          <DialogTitle className="break-words">
            {dealer ? `${withoutDealer ? t('monthlyClosing.withoutDealer') : dealer.dealer} — ${closingMonthLabel(params.month)}` : ''}
          </DialogTitle>
          <DialogDescription>{tint ? t('monthlyClosing.tintTitle') : t('monthlyClosing.title')}</DialogDescription>
        </DialogHeader>

        {detail.isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {detail.error instanceof Error ? detail.error.message : t('common.failedToLoad')}
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-w-0 gap-4">
          <TabsList className="flex h-auto w-full flex-wrap sm:w-fit">
            {!withoutDealer ? (
              <TabsTrigger value="income" className="cursor-pointer">
                {t('monthlyClosing.tabIncome')}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="payroll" className="cursor-pointer">
              {t('monthlyClosing.tabPayroll')}
            </TabsTrigger>
            {!withoutDealer ? (
              <TabsTrigger value="expenses" className="cursor-pointer">
                {t('monthlyClosing.tabExpenses')}
              </TabsTrigger>
            ) : null}
          </TabsList>

          {!withoutDealer ? (
            <TabsContent value="income" className="min-w-0">
              <DataTable<ClosingIncomeLine>
                tableId="monthly-closing-detail-income"
                columns={incomeColumns}
                data={data?.income ?? []}
                getRowId={(_, i) => String(i)}
                emptyState={empty('emptyIncome')}
                footer={data && data.income.length > 0 ? totalBar(sumCents(data.income.map((l) => l.total))) : undefined}
                {...tableProps}
              />
            </TabsContent>
          ) : null}
          <TabsContent value="payroll" className="min-w-0">
            <DataTable<ClosingPayrollLine>
              tableId="monthly-closing-detail-payroll"
              columns={payrollColumns}
              data={data?.payroll ?? []}
              getRowId={(_, i) => String(i)}
              emptyState={empty('emptyPayroll')}
              footer={data && data.payroll.length > 0 ? totalBar(sumCents(data.payroll.map((l) => l.amount))) : undefined}
              {...tableProps}
            />
          </TabsContent>
          {!withoutDealer ? (
            <TabsContent value="expenses" className="min-w-0">
              <DataTable<ClosingExpenseLine>
                tableId="monthly-closing-detail-expenses"
                columns={expenseColumns}
                data={data?.expenses ?? []}
                getRowId={(_, i) => String(i)}
                emptyState={empty('emptyExpenses')}
                footer={
                  data && data.expenses.length > 0 ? totalBar(sumCents(data.expenses.map((l) => l.amount))) : undefined
                }
                {...tableProps}
              />
            </TabsContent>
          ) : null}
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" className="cursor-pointer" onClick={onClose}>
            <X />
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
