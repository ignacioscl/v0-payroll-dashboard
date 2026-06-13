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

/** Render $ cells like the XLSX: empty when 0, formatted otherwise. */
const money = (n: number) => (n > 0 ? usd.format(n) : '')
/** Counts render empty when 0. */
const qty = (n: number) => (n > 0 ? String(n) : '')

/** "Worked Days/Hours" exactly like the PHP export: "5 / 42.50", "5" or "42.50". */
function workedDaysHours(row: PayrollReportRow): string {
  if (row.workedDays > 0 && row.workedHours > 0)
    return `${row.workedDays} / ${row.workedHours.toFixed(2)}`
  if (row.workedDays > 0) return String(row.workedDays)
  if (row.workedHours > 0) return row.workedHours.toFixed(2)
  return ''
}

const meta = (m: DataTableColumnMeta<PayrollReportRow>) => m

const columns: ColumnDef<PayrollReportRow>[] = [
  {
    accessorKey: 'employeeId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
    size: 90,
    meta: meta({ label: 'ID', mono: true }),
  },
  {
    accessorKey: 'form',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Form" />,
    size: 80,
    cell: ({ row }) => (
      <Badge variant="outline" className="text-[11px] font-medium">
        {row.original.form}
      </Badge>
    ),
    meta: meta({ label: 'Form' }),
  },
  {
    accessorKey: 'dealer',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dealer" />,
    size: 180,
    meta: meta({ label: 'Dealer' }),
  },
  {
    accessorKey: 'employee',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employee Name" />,
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
    meta: meta({ label: 'Employee Name' }),
  },
  {
    accessorKey: 'role',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
    size: 140,
    meta: meta({ label: 'Role' }),
  },
  {
    accessorKey: 'dailyRate',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Daily Rate" />,
    size: 100,
    cell: ({ row }) => money(row.original.dailyRate),
    meta: meta({ label: 'Daily Rate', numeric: true }),
  },
  {
    accessorKey: 'hourlyRate',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Hourly Rate" />,
    size: 105,
    cell: ({ row }) => money(row.original.hourlyRate),
    meta: meta({ label: 'Hourly Rate', numeric: true }),
  },
  {
    id: 'worked',
    accessorFn: (row) => workedDaysHours(row),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Worked Days/Hours" />,
    size: 140,
    meta: meta({ label: 'Worked Days/Hours', numeric: true }),
  },
  {
    accessorKey: 'salary',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Salary $" />,
    size: 100,
    cell: ({ row }) => money(row.original.salary),
    meta: meta({ label: 'Salary $', numeric: true }),
  },
  {
    accessorKey: 'commission',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Commission $" />,
    size: 115,
    cell: ({ row }) => money(row.original.commission),
    meta: meta({ label: 'Commission $', numeric: true }),
  },
  {
    accessorKey: 'hourlyDailyPay',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Hourly/Daily $" />,
    size: 115,
    cell: ({ row }) => money(row.original.hourlyDailyPay),
    meta: meta({ label: 'Hourly/Daily $', numeric: true }),
  },
  {
    accessorKey: 'closingsCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Closings" />,
    size: 90,
    cell: ({ row }) => qty(row.original.closingsCount),
    meta: meta({ label: 'Closings', numeric: true }),
  },
  {
    accessorKey: 'closings',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Closings $" />,
    size: 100,
    cell: ({ row }) => money(row.original.closings),
    meta: meta({ label: 'Closings $', numeric: true }),
  },
  {
    accessorKey: 'sundayCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sunday" />,
    size: 85,
    cell: ({ row }) => qty(row.original.sundayCount),
    meta: meta({ label: 'Sunday', numeric: true }),
  },
  {
    accessorKey: 'sunday',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sunday $" />,
    size: 95,
    cell: ({ row }) => money(row.original.sunday),
    meta: meta({ label: 'Sunday $', numeric: true }),
  },
  {
    accessorKey: 'proratedCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Prorated Day" />,
    size: 110,
    cell: ({ row }) => qty(row.original.proratedCount),
    meta: meta({ label: 'Prorated Day', numeric: true }),
  },
  {
    accessorKey: 'prorated',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Prorated $" />,
    size: 100,
    cell: ({ row }) => money(row.original.prorated),
    meta: meta({ label: 'Prorated $', numeric: true }),
  },
  {
    accessorKey: 'extraCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Extra" />,
    size: 80,
    cell: ({ row }) => qty(row.original.extraCount),
    meta: meta({ label: 'Extra', numeric: true }),
  },
  {
    accessorKey: 'extra',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Extra $" />,
    size: 90,
    cell: ({ row }) => money(row.original.extra),
    meta: meta({ label: 'Extra $', numeric: true }),
  },
  {
    accessorKey: 'shopCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Shop" />,
    size: 80,
    cell: ({ row }) => qty(row.original.shopCount),
    meta: meta({ label: 'Shop', numeric: true }),
  },
  {
    accessorKey: 'shop',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Shop $" />,
    size: 90,
    cell: ({ row }) => money(row.original.shop),
    meta: meta({ label: 'Shop $', numeric: true }),
  },
  {
    accessorKey: 'otherCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Other" />,
    size: 80,
    cell: ({ row }) => qty(row.original.otherCount),
    meta: meta({ label: 'Other', numeric: true }),
  },
  {
    accessorKey: 'other',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Other $" />,
    size: 90,
    cell: ({ row }) => money(row.original.other),
    meta: meta({ label: 'Other $', numeric: true }),
  },
  {
    accessorKey: 'piecework',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Piecework $" />,
    size: 110,
    cell: ({ row }) => money(row.original.piecework),
    meta: meta({ label: 'Piecework $', numeric: true }),
  },
  {
    accessorKey: 'netPay',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Net Pay" />,
    size: 110,
    cell: ({ row }) => (
      <span className="font-semibold">{usd.format(row.original.netPay)}</span>
    ),
    meta: meta({ label: 'Net Pay', numeric: true, pin: 'right' }),
  },
  {
    id: 'issues',
    accessorFn: (row) => row.punchError ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Issues" />,
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
    meta: meta({ label: 'Issues' }),
  },
]

const ALL = 'all'

export default function PayrollReportPage() {
  const [week, setWeek] = React.useState(PAYROLL_WEEKS[PAYROLL_WEEKS.length - 1].value)
  const [dealer, setDealer] = React.useState<string>(ALL)
  const [role, setRole] = React.useState<string>(ALL)
  const [form, setForm] = React.useState<string>(ALL)

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <FileSpreadsheet className="h-7 w-7 text-primary" />
            Payroll Report
            <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
              DEV
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1">
            Web version of the payroll XLSX export (ttk_payroll_report) — same columns, on-screen with export
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="flex flex-wrap items-end gap-4 pt-4 pb-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Week</Label>
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
            <Label className="text-xs text-muted-foreground">Dealer</Label>
            <Select value={dealer} onValueChange={setDealer}>
              <SelectTrigger className="w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Dealers</SelectItem>
                {PAYROLL_DEALERS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Roles</SelectItem>
                {PAYROLL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Form</Label>
            <Select value={form} onValueChange={setForm}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                <SelectItem value="W-2">W-2</SelectItem>
                <SelectItem value="1099">1099</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Totals (mirrors the XLSX TOTAL row) */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {totals.employees} employees
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs border-emerald-300 bg-emerald-50 text-emerald-700">
              <Wallet className="h-3.5 w-3.5" />
              Total Net Pay: {usd.format(totals.netPay)}
            </Badge>
            {totals.issues > 0 && (
              <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs border-destructive/30 bg-destructive/10 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                {totals.issues} punch issues
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report table */}
      <DataTable<PayrollReportRow>
        tableId="payroll-report"
        columns={columns}
        data={rows}
        density="compact"
        zebraRows
        stickyHeader
        enableExport
        exportFileName={`payroll-report-${week}`}
        globalFilterPlaceholder="Search employee, dealer, role…"
        tableScrollHeight="calc(100dvh - 24rem)"
        emptyState={
          <div className="py-10 text-center text-sm text-muted-foreground">
            No payroll rows for {weekLabel} with the selected filters.
          </div>
        }
      />
    </div>
  )
}
