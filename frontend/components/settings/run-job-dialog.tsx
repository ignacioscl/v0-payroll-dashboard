'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/filters/date-picker'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { formatDateParam } from '@/lib/ttk/map-header-filters'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import { fetchJobCompanies, type JobCompany, type JobFormField, type JobInfo } from '@/lib/jobs-api'

/** «All companies» = sin `idContratista` en el payload. */
const ALL_COMPANIES: JobCompany = { id: 0, name: '' }

type RunJobDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobs: JobInfo[]
  onRun: (name: string, body: { payload: Record<string, unknown>; force: boolean }) => void
}

function fieldLabel(field: JobFormField, t: TranslateFn): string {
  if (field.type === 'company') return t('systemConfig.jobsFieldCompany')
  if (field.type === 'dateFrom') return t('systemConfig.jobsFieldFrom')
  if (field.type === 'dateTo') return t('systemConfig.jobsFieldTo')
  if (field.type === 'boolean' && field.key === 'force') return t('systemConfig.jobsForce')
  return field.label
}

/**
 * «Run job» del monitor: se elige el job y aparecen los campos que ese job declara (`form` en el
 * handler). Sin «Dry run» (Ignacio, 03/10): `dryRun` queda solo en el endpoint y el CLI.
 */
export function RunJobDialog({ open, onOpenChange, jobs, onRun }: RunJobDialogProps) {
  const { t } = useTranslation()
  const runnable = useMemo(() => jobs.filter((j) => j.runnable), [jobs])
  const [jobName, setJobName] = useState('')
  const [company, setCompany] = useState<JobCompany | null>(ALL_COMPANIES)
  const [companyTerm, setCompanyTerm] = useState('')
  const [dates, setDates] = useState<Record<string, Date | undefined>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    setJobName(runnable[0]?.name ?? '')
    setCompany(ALL_COMPANIES)
    setCompanyTerm('')
    setDates({})
    setFlags({})
  }, [open, runnable])

  const job = runnable.find((j) => j.name === jobName)
  const needsCompanies = Boolean(job?.fields.some((f) => f.type === 'company'))
  const companies = useQuery({
    queryKey: ['jobs', 'companies'],
    queryFn: fetchJobCompanies,
    enabled: open && needsCompanies,
    staleTime: 5 * 60_000,
  })
  const companyItems = useMemo(() => {
    const term = companyTerm.trim().toLowerCase()
    const list = [ALL_COMPANIES, ...(companies.data ?? [])]
    return term ? list.filter((c) => (c.id === 0 ? t('systemConfig.jobsAllCompanies') : c.name).toLowerCase().includes(term)) : list
  }, [companies.data, companyTerm, t])

  const fromField = job?.fields.find((f) => f.type === 'dateFrom')

  const submit = () => {
    if (!job) return
    const payload: Record<string, unknown> = {}
    let force = false
    for (const f of job.fields) {
      if (f.type === 'company' && company && company.id > 0) payload[f.key] = company.id
      if ((f.type === 'dateFrom' || f.type === 'dateTo') && dates[f.key]) payload[f.key] = formatDateParam(dates[f.key])
      if (f.type === 'boolean') {
        if (f.key === 'force') force = Boolean(flags[f.key])
        else payload[f.key] = Boolean(flags[f.key])
      }
    }
    onRun(job.name, { payload, force })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('systemConfig.jobsRunTitle')}</DialogTitle>
          <DialogDescription>{t('systemConfig.jobsRunSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="run-job-select">{t('systemConfig.jobsFieldJob')}</Label>
            <Select value={jobName} onValueChange={setJobName}>
              <SelectTrigger id="run-job-select" className="w-full cursor-pointer font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {runnable.map((j) => (
                  <SelectItem key={j.name} value={j.name} className="font-mono">
                    {j.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {job?.fields.some((f) => f.type === 'company') ? (
            <div className="space-y-1.5">
              <Label>{t('systemConfig.jobsFieldCompany')}</Label>
              <SearchableCombobox<JobCompany>
                value={company}
                onChange={(c) => setCompany(c ?? ALL_COMPANIES)}
                searchTerm={companyTerm}
                onSearchTermChange={setCompanyTerm}
                items={companyItems}
                isLoading={companies.isLoading}
                getItemKey={(c) => c.id}
                getItemLabel={(c) => (c.id === 0 ? t('systemConfig.jobsAllCompanies') : c.name)}
                placeholder={t('systemConfig.jobsAllCompanies')}
              />
            </div>
          ) : null}

          {job?.fields.some((f) => f.type === 'dateFrom' || f.type === 'dateTo') ? (
            <div className="space-y-1.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {job.fields
                  .filter((f) => f.type === 'dateFrom' || f.type === 'dateTo')
                  .map((f) => (
                    <div key={f.key} className="min-w-0 space-y-1.5">
                      <Label>{fieldLabel(f, t)}</Label>
                      <DatePicker
                        value={dates[f.key]}
                        onChange={(d) => setDates((prev) => ({ ...prev, [f.key]: d }))}
                        placeholder={t('systemConfig.jobsSelectDate')}
                        className="w-full"
                        fromDate={f.type === 'dateTo' && fromField ? dates[fromField.key] : undefined}
                      />
                    </div>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">{t('systemConfig.jobsDatesHint')}</p>
            </div>
          ) : null}

          {job?.fields
            .filter((f) => f.type === 'boolean')
            .map((f) => (
              <div key={f.key} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <Switch
                  id={`run-job-${f.key}`}
                  checked={Boolean(flags[f.key])}
                  onCheckedChange={(v) => setFlags((prev) => ({ ...prev, [f.key]: v }))}
                />
                <Label htmlFor={`run-job-${f.key}`} className="flex cursor-pointer flex-col items-start gap-0.5 font-normal">
                  <span className="font-medium">{fieldLabel(f, t)}</span>
                  {f.key === 'force' ? (
                    <span className="text-xs text-muted-foreground">{t('systemConfig.jobsForceHint')}</span>
                  ) : null}
                </Label>
              </div>
            ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X />
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!job}>
            <Play />
            {t('systemConfig.jobsRunButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
