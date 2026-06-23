'use client'

// =============================================================================
// Business KPIs — REAL (datos del backend NestJS, no mock).
// Mismo layout de tarjetas/tabs que /kpis (mock) para comparar 1:1.
// El mock queda intacto en app/(dashboard)/kpis/page.tsx como referencia.
// =============================================================================

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  Clock,
  DollarSign,
  Fingerprint,
  Gauge,
  HandCoins,
  Hourglass,
  Layers,
  Pencil,
  Percent,
  Receipt,
  Send,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react'
import { KPICard } from '@/components/dashboard/kpi-card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  fetchBillingKpi,
  fetchCollectionsKpi,
  fetchPayrollKpi,
  fetchProductionKpi,
  fetchPunchKpi,
} from '@/lib/srs-kpis-api'

type Period = '4w' | '12w'

const fmtMoney = (n: number | undefined) =>
  n === undefined ? '—' : `$${Math.round(n).toLocaleString()}`
const fmtMoneyK = (n: number | undefined) =>
  n === undefined ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`

function periodToDates(period: Period) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (period === '4w' ? 28 : 84))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { fechaDesde: fmt(start), fechaHasta: fmt(end) }
}

export default function BusinessKpisRealPage() {
  const [period, setPeriod] = useState<Period>('4w')
  const { fechaDesde, fechaHasta } = useMemo(() => periodToDates(period), [period])
  const range = [fechaDesde, fechaHasta] as const

  const prod = useQuery({ queryKey: ['srs-kpi', 'production', ...range], queryFn: () => fetchProductionKpi(fechaDesde, fechaHasta) })
  const bill = useQuery({ queryKey: ['srs-kpi', 'billing', ...range], queryFn: () => fetchBillingKpi(fechaDesde, fechaHasta) })
  const coll = useQuery({ queryKey: ['srs-kpi', 'collections', ...range], queryFn: () => fetchCollectionsKpi(fechaDesde, fechaHasta) })
  const punch = useQuery({ queryKey: ['srs-kpi', 'punch', ...range], queryFn: () => fetchPunchKpi(fechaDesde, fechaHasta) })
  const pay = useQuery({ queryKey: ['srs-kpi', 'payroll', ...range], queryFn: () => fetchPayrollKpi(fechaDesde, fechaHasta) })

  const p = prod.data
  const b = bill.data
  const c = coll.data
  const k = punch.data
  const y = pay.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Gauge className="h-7 w-7 text-primary" />
            Business KPIs
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
              REAL
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Datos reales del backend ({fechaDesde} → {fechaHasta}). El mock queda en /kpis como referencia.
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="4w">Últimas 4 semanas</SelectItem>
            <SelectItem value="12w">Últimas 12 semanas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="production" className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="production">WO Production</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="punch">Punch Quality</TabsTrigger>
          <TabsTrigger value="payroll">Payroll Spend</TabsTrigger>
        </TabsList>

        {/* PRODUCTION */}
        <TabsContent value="production" className="space-y-6">
          <ErrorOrLoading q={prod} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title="Production Value" value={fmtMoneyK(p?.productionValue)} icon={<Wrench className="h-5 w-5" />} variant="success" />
            <KPICard compact title="WOs Completed" value={p ? p.woCompleted.toLocaleString() : '—'} icon={<CheckCheck className="h-5 w-5" />} variant="default" />
            <KPICard compact title="Avg Cycle Time" value={p ? `${p.avgCycleHours}h` : '—'} icon={<Clock className="h-5 w-5" />} variant="info" subtitle="creación → done" />
            <KPICard compact title="On-Time %" value={p ? `${p.onTimePct}%` : '—'} icon={<Target className="h-5 w-5" />} variant="default" subtitle="vs promise" />
            <KPICard compact title="Open Backlog" value={p ? p.openBacklog : '—'} icon={<Layers className="h-5 w-5" />} variant="warning" subtitle={p ? `${p.backlogOver7d} >7 días` : ''} />
            <KPICard compact title="Pending Approval" value={p ? p.pendingApproval : '—'} icon={<ClipboardCheck className="h-5 w-5" />} variant="violet" subtitle={p ? `${p.avgApprovalHours}h prom.` : ''} />
            <KPICard compact title="Inspection Fail %" value={p ? `${p.inspectionFailPct}%` : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="danger" />
          </div>
        </TabsContent>

        {/* BILLING */}
        <TabsContent value="billing" className="space-y-6">
          <ErrorOrLoading q={bill} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title="Invoiced" value={fmtMoneyK(b?.invoicedValue)} icon={<Receipt className="h-5 w-5" />} variant="success" />
            <KPICard compact title="Statements" value={b ? b.statementsIssued.toLocaleString() : '—'} icon={<Receipt className="h-5 w-5" />} variant="default" subtitle={b ? `${fmtMoney(b.avgInvoiceValue)} prom.` : ''} />
            <KPICard compact title="Done, Not Invoiced" value={b ? b.unbilledWos : '—'} icon={<Hourglass className="h-5 w-5" />} variant="danger" subtitle={b ? fmtMoney(b.unbilledValue) : ''} />
            <KPICard compact title="WO Done → Invoiced" value={b ? `${b.avgDoneToInvoicedDays}d` : '—'} icon={<CalendarClock className="h-5 w-5" />} variant="warning" />
            <KPICard compact title="Statements Sent %" value={b ? `${b.sentPct}%` : '—'} icon={<Send className="h-5 w-5" />} variant="info" subtitle={b ? `${b.unsentStatements} sin enviar` : ''} />
          </div>
        </TabsContent>

        {/* COLLECTIONS */}
        <TabsContent value="collections" className="space-y-6">
          <ErrorOrLoading q={coll} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title="Outstanding AR" value={fmtMoneyK(c?.outstandingAr)} icon={<Banknote className="h-5 w-5" />} variant="warning" subtitle={c ? `${c.openStatements} statements` : ''} />
            <KPICard compact title="DSO" value={c ? `${c.dsoDays}d` : '—'} icon={<CalendarClock className="h-5 w-5" />} variant="danger" />
            <KPICard compact title="Collected" value={fmtMoneyK(c?.collectedValue)} icon={<DollarSign className="h-5 w-5" />} variant="success" />
            <KPICard compact title="Collection Rate" value={c ? `${c.collectionRatePct}%` : '—'} icon={<Percent className="h-5 w-5" />} variant="info" />
            <KPICard compact title="AR over 60" value={c ? `${c.arOver60Pct}%` : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="violet" />
          </div>
        </TabsContent>

        {/* PUNCH */}
        <TabsContent value="punch" className="space-y-6">
          <ErrorOrLoading q={punch} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title="Punch Error Rate" value={k ? `${k.errorRatePct}%` : '—'} icon={<Fingerprint className="h-5 w-5" />} variant="danger" subtitle={k ? `${k.totalPunches.toLocaleString()} punches` : ''} />
            <KPICard compact title="Missing Punch-Out" value={k ? k.missingPunchOut : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="warning" subtitle={k ? `${k.missingBreakEnd} break` : ''} />
            <KPICard compact title="Manual Punches" value={k ? k.manualPunches : '—'} icon={<Pencil className="h-5 w-5" />} variant="violet" />
            <KPICard compact title="Admin Corrections" value={k ? k.adminCorrections : '—'} icon={<ClipboardCheck className="h-5 w-5" />} variant="info" />
            <KPICard compact title="Correction Delay" value={k ? `${k.avgCorrectionDelayDays}d` : '—'} icon={<Clock className="h-5 w-5" />} variant="default" />
            <KPICard compact title="Deleted Punches" value={k ? k.deletedPunches : '—'} icon={<Trash2 className="h-5 w-5" />} variant="danger" />
          </div>
        </TabsContent>

        {/* PAYROLL */}
        <TabsContent value="payroll" className="space-y-6">
          <ErrorOrLoading q={pay} />
          <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Payroll todavía no está reescrito por semana en el backend — estos valores son provisionales.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title="Total Payroll" value={fmtMoneyK(y?.totalPayroll)} icon={<HandCoins className="h-5 w-5" />} variant="success" />
            <KPICard compact title="Overtime Cost" value={fmtMoneyK(y?.overtimeCost)} icon={<Timer className="h-5 w-5" />} variant="warning" subtitle={y ? `${y.overtimePct}%` : ''} />
            <KPICard compact title="Labor Cost / Revenue" value={y ? `${y.laborCostPct}%` : '—'} icon={<Percent className="h-5 w-5" />} variant="violet" />
            <KPICard compact title="Cost per WO" value={y ? `$${y.avgCostPerWo.toFixed(2)}` : '—'} icon={<Wrench className="h-5 w-5" />} variant="info" />
            <KPICard compact title="Active Employees" value={y ? y.activeEmployees : '—'} icon={<Users className="h-5 w-5" />} variant="default" subtitle={y ? `$${y.avgHourlyRate}/h` : ''} />
            <KPICard compact title="Revenue / Employee" value={y && p ? fmtMoneyK(Math.round(p.productionValue / Math.max(1, y.activeEmployees))) : '—'} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ErrorOrLoading({ q }: { q: { isLoading: boolean; isError: boolean; error: unknown } }) {
  if (q.isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando datos reales…</div>
  }
  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : 'Error'
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudo cargar del backend: {msg}. (¿Está levantado el backend en :3020 y con un usuario con permiso?)
      </div>
    )
  }
  return null
}
