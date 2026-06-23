'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { PlusCircle } from 'lucide-react'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { useTtkEmployeeSearch, type TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import { DateRangePicker } from '@/components/filters/date-range-picker'
import { DealerSelect } from '@/components/filters/dealer-select'
import { DealerMultiSelect } from '@/components/filters/dealer-multi-select'
import { AddPunchDialog } from '@/components/ttk/add-punch-dialog'
import { EmployeeCombobox } from '@/components/ttk/employee-combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ParallelRequestTest } from '@/components/dev/parallel-request-test'
import { getDefaultDateRange } from '@/lib/filters/date-range-presets'

export default function ComponentsPage() {
  const { dealers: dealerOptions, loading, error } = useSrsDealers()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [dealer, setDealer] = useState('all')
  const [dealers, setDealers] = useState<string[]>([])
  const [employeeDealer, setEmployeeDealer] = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<TtkEmployeeOption | null>(null)
  const [addPunchOpen, setAddPunchOpen] = useState(false)
  const didInitDealers = useRef(false)
  const didInitEmployeeDealer = useRef(false)

  const employeeDealerId = useMemo(() => {
    if (!employeeDealer) return null
    const id = Number(employeeDealer)
    return Number.isFinite(id) && id > 0 ? id : null
  }, [employeeDealer])

  const employeeDealerName = useMemo(() => {
    if (!employeeDealerId) return undefined
    return dealerOptions.find((d) => String(d.id) === String(employeeDealerId))?.label
  }, [dealerOptions, employeeDealerId])

  const employeesQuery = useTtkEmployeeSearch(
    employeeSearch,
    employeeDealerId,
    employeeDealerId != null,
  )

  useEffect(() => {
    setDateRange(getDefaultDateRange())
  }, [])

  // Only pre-select all once when SRS dealers first load — not when user clears selection
  useEffect(() => {
    if (!didInitDealers.current && dealerOptions.length > 0) {
      setDealers(dealerOptions.map((d) => d.id))
      didInitDealers.current = true
    }
  }, [dealerOptions])

  useEffect(() => {
    if (!didInitEmployeeDealer.current && dealerOptions.length > 0) {
      setEmployeeDealer(dealerOptions[0]!.id)
      didInitEmployeeDealer.current = true
    }
  }, [dealerOptions])

  const selectedDealerLabels = dealerOptions
    .filter((d) => dealers.includes(d.id))
    .map((d) => d.label)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Components</h1>
        <p className="mt-1 text-muted-foreground">
          Shared filters and controls used across the payroll dashboard (shadcn / site style).
        </p>
        {error && (
          <p className="mt-2 text-sm text-destructive">Could not load dealers from SRS: {error}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ComponentCard
          title="Date range picker"
          description="Two-month calendar with quick presets (Last 7/15/30 days, This month, Last Month) — same control as the header date filter."
        >
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Preview label="Selection">
            {dateRange?.from
              ? dateRange.to
                ? `${dateRange.from.toISOString().slice(0, 10)} → ${dateRange.to.toISOString().slice(0, 10)}`
                : dateRange.from.toISOString().slice(0, 10)
              : '—'}
          </Preview>
        </ComponentCard>

        <ComponentCard
          title="Dealer select"
          description="Single dealer from SRS (json.contratistas.php), same source as invoice_main."
        >
          <DealerSelect
            dealers={dealerOptions}
            value={dealer}
            onValueChange={setDealer}
            loading={loading}
            disabled={!!error}
          />
          <Preview label="Value">
            {dealer === 'all'
              ? 'All Dealers'
              : dealerOptions.find((d) => d.id === dealer)?.label ?? dealer}
          </Preview>
        </ComponentCard>

        <ComponentCard
          title="Dealer multi-select"
          description="Multi-check dealers from SRS — same list as #id_dealer_multi on invoice_main."
          className="lg:col-span-2"
        >
          <DealerMultiSelect
            dealers={dealerOptions}
            value={dealers}
            onChange={setDealers}
            loading={loading}
            disabled={!!error}
          />
          <Preview label={`Selected (${dealers.length})`}>
            {loading ? (
              <span className="text-muted-foreground">Loading...</span>
            ) : dealers.length === dealerOptions.length && dealerOptions.length > 0 ? (
              <Badge variant="secondary">All Dealers</Badge>
            ) : dealers.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedDealerLabels.map((name) => (
                  <Badge key={name} variant="outline">
                    {name}
                  </Badge>
                ))}
              </div>
            )}
          </Preview>
        </ComponentCard>

        <ComponentCard
          title="Employee combobox (Add punch)"
          description="Searchable employee picker used in Add punch — type at least 2 characters after selecting one dealer."
          className="lg:col-span-2"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Dealer (required)
              </Label>
              <DealerSelect
                dealers={dealerOptions}
                value={employeeDealer}
                onValueChange={(next) => {
                  setEmployeeDealer(next)
                  setSelectedEmployee(null)
                  setEmployeeSearch('')
                }}
                loading={loading}
                disabled={!!error}
                includeAll={false}
                placeholder="Select dealer…"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Employee
              </Label>
              <EmployeeCombobox
                value={selectedEmployee}
                onChange={setSelectedEmployee}
                searchTerm={employeeSearch}
                onSearchTermChange={setEmployeeSearch}
                employees={employeesQuery.data}
                isLoading={employeesQuery.isFetching}
                dealerSelected={employeeDealerId != null}
              />
            </div>
          </div>
          <Preview label="Selection">
            {!employeeDealerId ? (
              <span className="text-muted-foreground">Pick a dealer first</span>
            ) : selectedEmployee ? (
              <span>
                {selectedEmployee.nombre}{' '}
                <Badge variant="outline" className="ml-1">
                  ID {selectedEmployee.id}
                </Badge>
              </span>
            ) : (
              <span className="text-muted-foreground">No employee selected</span>
            )}
          </Preview>
        </ComponentCard>

        <ComponentCard
          title="Add punch dialog"
          description="Full manual punch form — employee search, clock in/out, break, and notes (same as Punch Report)."
          className="lg:col-span-2"
        >
          <p className="text-sm text-muted-foreground">
            Uses the dealer selected in the employee combobox demo above.
          </p>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!employeeDealerId}
            onClick={() => setAddPunchOpen(true)}
          >
            <PlusCircle className="h-4 w-4" />
            Open Add punch
          </Button>
          <AddPunchDialog
            open={addPunchOpen}
            onOpenChange={setAddPunchOpen}
            idDealer={employeeDealerId}
            dealerName={employeeDealerName}
          />
        </ComponentCard>

        <ComponentCard
          title="Parallel request test (temp)"
          description="10 calls to compare parallel vs serial — remove after testing."
          className="lg:col-span-2"
        >
          <ParallelRequestTest />
        </ComponentCard>
      </div>
    </div>
  )
}

function ComponentCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function Preview({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <div className="text-foreground">{children}</div>
    </div>
  )
}
