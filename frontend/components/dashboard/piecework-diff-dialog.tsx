'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
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
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  fetchPayrollPieceworkDiff,
  type KpiQueryParams,
  type PayrollPieceworkDiffRow,
} from '@/lib/srs-kpis-api'

const fmtCents = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type PieceworkDiffDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Los mismos parámetros que la tab Payroll Spend (fechas y dealers del header). */
  params: KpiQueryParams | null
}

/**
 * Detalle de la tarjeta Piecework (plan-piecework-payroll-vs-wo §2.3): los días, dealers y
 * empleados en que el piecework de las WO difiere del que paga payroll, con el motivo.
 */
export function PieceworkDiffDialog({ open, onOpenChange, params }: PieceworkDiffDialogProps) {
  const { t } = useTranslation()

  const diff = useQuery({
    queryKey: ['srs-kpi', 'payroll-piecework-diff', params],
    queryFn: () => fetchPayrollPieceworkDiff(params!),
    enabled: open && Boolean(params),
  })

  const columns = React.useMemo<ColumnDef<PayrollPieceworkDiffRow>[]>(() => {
    const dateLabel = t('businessKpis.pieceworkDiffColDate')
    const dealerLabel = t('businessKpis.pieceworkDiffColDealer')
    const employeeLabel = t('businessKpis.pieceworkDiffColEmployee')
    const workOrdersLabel = t('businessKpis.pieceworkDiffColWorkOrders')
    const payrollLabel = t('businessKpis.pieceworkDiffColPayroll')
    const differenceLabel = t('businessKpis.pieceworkDiffColDifference')
    const reasonLabel = t('businessKpis.pieceworkDiffColReason')
    const money = (
      id: 'workOrders' | 'payroll' | 'difference',
      label: string,
    ): ColumnDef<PayrollPieceworkDiffRow> => ({
      id,
      accessorFn: (row) => row[id],
      size: 130,
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={label} />,
      cell: ({ row }) => (
        <span className={id === 'difference' ? 'font-semibold tabular-nums' : 'tabular-nums'}>
          {fmtCents(row.original[id])}
        </span>
      ),
      meta: { label, numeric: true } satisfies DataTableColumnMeta<PayrollPieceworkDiffRow>,
    })
    return [
      {
        id: 'fecha',
        accessorFn: (row) => row.fecha,
        size: 110,
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={dateLabel} />,
        cell: ({ row }) => <span className="tabular-nums">{formatUsCalendarDate(row.original.fecha)}</span>,
        meta: { label: dateLabel } satisfies DataTableColumnMeta<PayrollPieceworkDiffRow>,
      },
      {
        id: 'dealer',
        accessorFn: (row) => row.dealer,
        minSize: 200,
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={dealerLabel} />,
        cell: ({ row }) => <span className="block truncate">{row.original.dealer}</span>,
        meta: { label: dealerLabel } satisfies DataTableColumnMeta<PayrollPieceworkDiffRow>,
      },
      {
        id: 'employee',
        accessorFn: (row) => row.employee,
        minSize: 220,
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={employeeLabel} />,
        cell: ({ row }) => <span className="block truncate font-medium">{row.original.employee}</span>,
        meta: { label: employeeLabel } satisfies DataTableColumnMeta<PayrollPieceworkDiffRow>,
      },
      money('workOrders', workOrdersLabel),
      money('payroll', payrollLabel),
      money('difference', differenceLabel),
      {
        id: 'reason',
        accessorFn: (row) => row.reason ?? '',
        minSize: 200,
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={reasonLabel} />,
        cell: ({ row }) => {
          const r = row.original
          if (r.reason === 'other_payment_type') {
            return (
              <span className="whitespace-normal">
                {t('businessKpis.pieceworkDiffReasonOtherType', { types: r.punchTypes ?? '' })}
              </span>
            )
          }
          if (r.reason === 'no_piecework_type') {
            return <span className="whitespace-normal">{t('businessKpis.pieceworkDiffReasonNoType')}</span>
          }
          return <span className="text-muted-foreground">—</span>
        },
        meta: { label: reasonLabel } satisfies DataTableColumnMeta<PayrollPieceworkDiffRow>,
      },
    ]
  }, [t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,80rem)]">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 text-left sm:px-6">
          <DialogTitle className="text-base sm:text-lg">{t('businessKpis.pieceworkDiffTitle')}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {t('businessKpis.pieceworkDiffDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 px-4 py-3 sm:px-6">
          <DataTable<PayrollPieceworkDiffRow>
            tableId="business-kpis-piecework-diff"
            columns={columns}
            data={diff.data ?? []}
            getRowId={(row) => `${row.fecha}|${row.idDealer}|${row.idUsuario}`}
            isLoading={diff.isLoading}
            emptyState={
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noDataToDisplay')}</p>
            }
            defaultPageSize={DATA_TABLE_PAGE_SIZE_ALL}
            includeAllPageSize
            tableScrollHeight="calc(90dvh - 19rem)"
            flexColumnId="reason"
            enableExport={false}
            enableGlobalFilter={false}
            enableViewOptions={false}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X />
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
