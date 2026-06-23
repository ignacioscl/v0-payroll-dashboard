'use client'

// =============================================================================
// Payroll Report — DEV ONLY (submenu of Business KPIs)
// Web + DataTable version of the XLSX exported by
// /modulos/ttk/php/ttk_payroll_report.php (tipo=payroll_xls).
// Same columns as XlsPayrollReportService, red rows → Issues badge.
// Export (CSV/XLSX) is built into the DataTable toolbar.
// =============================================================================

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, FileSpreadsheet, Users, Wallet } from 'lucide-react'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'
import {
  PAYROLL_DEALERS,
  PAYROLL_ROLES,
  PAYROLL_WEEKS,
  getPayrollReportRows,
  type PayrollReportRow,
} from '@/lib/payroll-report-mock-data'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const money = (n: number) => (n > 0 ? usd.format(n) : '')
const qty = (n: number) => (n > 0 ? String(n) : '')

function workedDaysHours(row: PayrollReportRow): string {
  if (row.workedDays > 0 && row.workedHours > 0)
    return `${row.workedDays} / ${row.workedHours.toFixed(2)}`
  if (row.workedDays > 0) return String(row.workedDays)
  if (row.workedHours > 0) return row.workedHours.toFixed(2)
  return ''
}

const meta = (m: DataTableColumnMeta<PayrollReportRow>) => m

const ALL = 'all'

export default function PayrollReportPage() {
  const { t } = useTranslation()
  const [week, setWeek] = React.useState(PAYROLL_WEEKS[PAYROLL_WEEKS.length - 1].value)
  const [dealer, setDealer] = React.useState<string>(ALL)
  const [role, setRole] = React.useState<string>(ALL)
  const [form, setForm] = React.useState<string>(ALL)

  const columns = React.useMemo<ColumnDef<PayrollReportRow>[]>(
    () => [
      {
        accessorKey: 'employeeId',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colId')} />,
        size: 90,
        meta: meta({ label: t('mockPayrollReport.colId'), mono: true }),
      },
      {
        accessorKey: 'form',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colForm')} />,
        size: 80,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[11px] font-medium">
            {row.original.form}
          </Badge>
        ),
        meta: meta({ label: t('mockPayrollReport.colForm') }),
      },
      {
        accessorKey: 'dealer',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dealer.label')} />,
        size: 180,
        meta: meta({ label: t('dealer.label') }),
      },
      {
        accessorKey: 'employee',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colEmployeeName')} />,
        size: 190,
        cell: ({ row }) => (
          <span
            className={cn(
              'flex items-center gap-1.5 font-medium',
              row.original.punchError && 'text-destructive',
            )}
          >
            {row.original.punchError && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            {row.original.employee}
          </span>
        ),
        meta: meta({ label: t('mockPayrollReport.colEmployeeName') }),
      },
      {
        accessorKey: 'role',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colRole')} />,
        size: 140,
        meta: meta({ label: t('mockPayrollReport.colRole') }),
      },
      {
        accessorKey: 'dailyRate',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colDailyRate')} />,
        size: 100,
        cell: ({ row }) => money(row.original.dailyRate),
        meta: meta({ label: t('mockPayrollReport.colDailyRate'), numeric: true }),
      },
      {
        accessorKey: 'hourlyRate',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colHourlyRate')} />,
        size: 105,
        cell: ({ row }) => money(row.original.hourlyRate),
        meta: meta({ label: t('mockPayrollReport.colHourlyRate'), numeric: true }),
      },
      {
        id: 'worked',
        accessorFn: (row) => workedDaysHours(row),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colWorkedDaysHours')} />,
        size: 140,
        meta: meta({ label: t('mockPayrollReport.colWorkedDaysHours'), numeric: true }),
      },
      {
        accessorKey: 'salary',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colSalary')} />,
        size: 100,
        cell: ({ row }) => money(row.original.salary),
        meta: meta({ label: t('mockPayrollReport.colSalary'), numeric: true }),
      },
      {
        accessorKey: 'commission',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colCommission')} />,
        size: 115,
        cell: ({ row }) => money(row.original.commission),
        meta: meta({ label: t('mockPayrollReport.colCommission'), numeric: true }),
      },
      {
        accessorKey: 'hourlyDailyPay',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colHourlyDaily')} />,
        size: 115,
        cell: ({ row }) => money(row.original.hourlyDailyPay),
        meta: meta({ label: t('mockPayrollReport.colHourlyDaily'), numeric: true }),
      },
      {
        accessorKey: 'closingsCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colClosings')} />,
        size: 90,
        cell: ({ row }) => qty(row.original.closingsCount),
        meta: meta({ label: t('mockPayrollReport.colClosings'), numeric: true }),
      },
      {
        accessorKey: 'closings',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colClosingsDollar')} />,
        size: 100,
        cell: ({ row }) => money(row.original.closings),
        meta: meta({ label: t('mockPayrollReport.colClosingsDollar'), numeric: true }),
      },
      {
        accessorKey: 'sundayCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colSunday')} />,
        size: 85,
        cell: ({ row }) => qty(row.original.sundayCount),
        meta: meta({ label: t('mockPayrollReport.colSunday'), numeric: true }),
      },
      {
        accessorKey: 'sunday',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colSundayDollar')} />,
        size: 95,
        cell: ({ row }) => money(row.original.sunday),
        meta: meta({ label: t('mockPayrollReport.colSundayDollar'), numeric: true }),
      },
      {
        accessorKey: 'proratedCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colProratedDay')} />,
        size: 110,
        cell: ({ row }) => qty(row.original.proratedCount),
        meta: meta({ label: t('mockPayrollReport.colProratedDay'), numeric: true }),
      },
      {
        accessorKey: 'prorated',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colProratedDollar')} />,
        size: 100,
        cell: ({ row }) => money(row.original.prorated),
        meta: meta({ label: t('mockPayrollReport.colProratedDollar'), numeric: true }),
      },
      {
        accessorKey: 'extraCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colExtra')} />,
        size: 80,
        cell: ({ row }) => qty(row.original.extraCount),
        meta: meta({ label: t('mockPayrollReport.colExtra'), numeric: true }),
      },
      {
        accessorKey: 'extra',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colExtraDollar')} />,
        size: 90,
        cell: ({ row }) => money(row.original.extra),
        meta: meta({ label: t('mockPayrollReport.colExtraDollar'), numeric: true }),
      },
      {
        accessorKey: 'shopCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colShop')} />,
        size: 80,
        cell: ({ row }) => qty(row.original.shopCount),
        meta: meta({ label: t('mockPayrollReport.colShop'), numeric: true }),
      },
      {
        accessorKey: 'shop',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colShopDollar')} />,
        size: 90,
        cell: ({ row }) => money(row.original.shop),
        meta: meta({ label: t('mockPayrollReport.colShopDollar'), numeric: true }),
      },
      {
        accessorKey: 'otherCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colOther')} />,
        size: 80,
        cell: ({ row }) => qty(row.original.otherCount),
        meta: meta({ label: t('mockPayrollReport.colOther'), numeric: true }),
      },
      {
        accessorKey: 'other',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colOtherDollar')} />,
        size: 90,
        cell: ({ row }) => money(row.original.other),
        meta: meta({ label: t('mockPayrollReport.colOtherDollar'), numeric: true }),
      },
      {
        accessorKey: 'piecework',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colPiecework')} />,
        size: 110,
        cell: ({ row }) => money(row.original.piecework),
        meta: meta({ label: t('mockPayrollReport.colPiecework'), numeric: true }),
      },
      {
        accessorKey: 'netPay',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colNetPay')} />,
        size: 110,
        cell: ({ row }) => (
          <span className="font-semibold">{usd.format(row.original.netPay)}</span>
        ),
        meta: meta({ label: t('mockPayrollReport.colNetPay'), numeric: true, pin: 'right' }),
      },
      {
        id: 'issues',
        accessorFn: (row) => row.punchError ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('mockPayrollReport.colIssues')} />,
        size: 240,
        cell: ({ row }) =>
          row.original.punchError ? (
            <Badge
              variant="outline"
              className="border-destructive/30 bg-destructive/10 text-destructive text-[11px] font-medium"
            >
              {row.original.punchError}
            </Badge>
          ) : null,
        meta: meta({ label: t('mockPayrollReport.colIssues') }),
      },
    ],
    [t],
  )

  const rows = React.useMemo(() => {
    let data = getPayrollReportRows(week)
    if (dealer !== ALL) data = data.filter((r) => r.dealer === dealer)
    if (role !== ALL) data = data.filter((r) => r.role === role)
    if (form !== ALL) data = data.filter((r) => r.form === form)
    return data
  }, [week, dealer, role, form])

  const totals = React.useMemo(
    () => ({
      employees: rows.length,
      netPay: rows.reduce((sum, r) => sum + r.netPay, 0),
      issues: rows.filter((r) => r.punchError).length,
    }),
    [rows],
  )

  const weekLabel = PAYROLL_WEEKS.find((w) => w.value === week)?.label ?? week

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <FileSpreadsheet className="h-7 w-7 text-primary" />
            {t('mockPayrollReport.title')}
            <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
              {t('common.dev')}
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1">{t('mockPayrollReport.subtitle')}</p>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="flex flex-wrap items-end gap-4 pt-4 pb-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('mockPayrollReport.week')}</Label>
            <Select value={week} onValueChange={setWeek}>
              <SelectTrigger className="w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYROLL_WEEKS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('dealer.label')}</Label>
            <Select value={dealer} onValueChange={setDealer}>
              <SelectTrigger className="w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('dealer.all')}</SelectItem>
                {PAYROLL_DEALERS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('mockPayrollReport.role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('mockPayrollReport.allRoles')}</SelectItem>
                {PAYROLL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('mockPayrollReport.form')}</Label>
            <Select value={form} onValueChange={setForm}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('mockPayrollReport.allForms')}</SelectItem>
                <SelectItem value="W-2">W-2</SelectItem>
                <SelectItem value="1099">1099</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {t('mockPayrollReport.employeesCount', { count: totals.employees })}
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs border-emerald-300 bg-emerald-50 text-emerald-700">
              <Wallet className="h-3.5 w-3.5" />
              {t('mockPayrollReport.totalNetPay', { amount: usd.format(totals.netPay) })}
            </Badge>
            {totals.issues > 0 && (
              <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs border-destructive/30 bg-destructive/10 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('mockPayrollReport.punchIssuesCount', { count: totals.issues })}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <DataTable<PayrollReportRow>
        tableId="payroll-report"
        columns={columns}
        data={rows}
        density="compact"
        zebraRows
        stickyHeader
        enableExport
        exportFileName={`payroll-report-${week}`}
        globalFilterPlaceholder={t('mockPayrollReport.searchPlaceholder')}
        tableScrollHeight="calc(100dvh - 24rem)"
        emptyState={
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t('mockPayrollReport.emptyState', { week: weekLabel })}
          </div>
        }
      />
    </div>
  )
}
