'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Save,
  X,
  Calendar as CalendarIcon,
  Coffee,
  LogIn,
  LogOut,
  StickyNote,
  AlertTriangle,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { useTtkPunchDetail } from '@/hooks/use-ttk-punch-detail'
import { useTtkEditPunch } from '@/hooks/use-ttk-edit-punch'
import type { TtkPunchDetail, TtkEditPunchPayload } from '@/lib/ttk/ttk-edit-types'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getPunchFieldLabel, getPunchFieldLabels } from '@/lib/i18n/label-helpers'
import {
  validatePunchForm,
  type PunchFormState,
  type PunchNoteKey,
  type PunchTimeKey,
} from '@/lib/ttk/punch-form-utils'

interface EditPunchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  punchId: number | string | null
  employeeName?: string
  initial?: Partial<Record<PunchTimeKey, string | null | undefined>>
  onSaved?: () => void
}

type FormState = PunchFormState

const TIME_TO_NOTE: Record<PunchTimeKey, PunchNoteKey> = {
  punchIn: 'punchInNote',
  breakStart: 'breakStartNote',
  breakEnd: 'breakEndNote',
  punchOut: 'punchOutNote',
}

const EMPTY_FORM: FormState = {
  punchIn: '',
  breakStart: '',
  breakEnd: '',
  punchOut: '',
  punchInNote: '',
  breakStartNote: '',
  breakEndNote: '',
  punchOutNote: '',
}

/** ISO/GMT0 → "YYYY-MM-DDTHH:mm" (datetime-local input value). */
function toDatetimeLocal(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  )
}

/** datetime-local string → ISO 8601 UTC, same as legacy formateDateTz(). */
function toIsoTz(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function EditPunchDialog({
  open,
  onOpenChange,
  punchId,
  employeeName,
  initial,
  onSaved,
}: EditPunchDialogProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [original, setOriginal] = useState<FormState>(EMPTY_FORM)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PunchTimeKey, string>>>({})

  const detailQuery = useTtkPunchDetail(open ? punchId : null, open)
  const editMutation = useTtkEditPunch()

  // Pre-fill form whenever the dialog opens or detail finishes loading.
  useEffect(() => {
    if (!open) return
    const detail: TtkPunchDetail | undefined = detailQuery.data
    const next: FormState = {
      punchIn: toDatetimeLocal(detail?.punchInGmt0 ?? initial?.punchIn ?? null),
      breakStart: toDatetimeLocal(detail?.breakStartGmt0 ?? initial?.breakStart ?? null),
      breakEnd: toDatetimeLocal(detail?.breakEndGmt0 ?? initial?.breakEnd ?? null),
      punchOut: toDatetimeLocal(detail?.punchOutGmt0 ?? initial?.punchOut ?? null),
      punchInNote: detail?.punchInNote ?? '',
      breakStartNote: detail?.breakStartNote ?? '',
      breakEndNote: detail?.breakEndNote ?? '',
      punchOutNote: detail?.punchOutNote ?? '',
    }
    setForm(next)
    setOriginal(next)
    setValidationError(null)
    setFieldErrors({})
  }, [open, detailQuery.data, initial?.punchIn, initial?.breakStart, initial?.breakEnd, initial?.punchOut])

  /**
   * Returns time fields modified vs. the loaded detail (shows note inputs).
   */
  const modifiedTimeFields = useMemo<PunchTimeKey[]>(() => {
    const keys: PunchTimeKey[] = ['punchIn', 'breakStart', 'breakEnd', 'punchOut']
    return keys.filter((k) => form[k] !== original[k])
  }, [form, original])

  const setField = (key: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setValidationError(null)
    setFieldErrors((prev) => {
      const timeKey = key as PunchTimeKey
      if (!prev[timeKey]) return prev
      const { [timeKey]: _omitted, ...rest } = prev
      return rest
    })
  }

  const clearField = (key: PunchTimeKey) => () => setField(key)('')

  const handleSubmit = async () => {
    if (!punchId) return
    const { generalError, fieldErrors: errs } = validatePunchForm(form, t)
    setFieldErrors(errs)
    if (generalError) {
      setValidationError(generalError)
      return
    }

    const payload: TtkEditPunchPayload = {
      id_ttk: punchId,
      punch_in: form.punchIn || null,
      punch_in_tz: toIsoTz(form.punchIn),
      break_start: form.breakStart || null,
      break_start_tz: toIsoTz(form.breakStart),
      break_end: form.breakEnd || null,
      break_end_tz: toIsoTz(form.breakEnd),
      punch_out: form.punchOut || null,
      punch_out_tz: toIsoTz(form.punchOut),
      punch_in_note: form.punchInNote || null,
      break_start_note: form.breakStartNote || null,
      break_end_note: form.breakEndNote || null,
      punch_out_note: form.punchOutNote || null,
    }

    try {
      const saved = await editMutation.mutateAsync(payload)
      toast.success(
        t('punch.updated', { name: saved.usuario?.nombre ?? t('common.employee') }),
      )
      onOpenChange(false)
      onSaved?.()
    } catch (e: unknown) {
      const message = getSrsErrorMessage(e, t('punch.updateFailed'))
      toast.error(message)
      setValidationError(message)
    }
  }

  const isProcessing = editMutation.isPending
  const isLoading = detailQuery.isLoading && !detailQuery.data

  const employeeDisplayName = useMemo(() => {
    return (detailQuery.data?.usuario?.nombre ?? employeeName ?? '').trim()
  }, [detailQuery.data?.usuario?.nombre, employeeName])

  const renderTimeField = (key: PunchTimeKey, icon: React.ReactNode, required = false) => {
    const noteKey = TIME_TO_NOTE[key]
    const isModified = modifiedTimeFields.includes(key)
    const fieldLabels = getPunchFieldLabels(t)
    return (
      <TimeField
        id={key}
        label={fieldLabels[key]}
        noteLabel={getPunchFieldLabel(t, noteKey)}
        icon={icon}
        value={form[key]}
        onChange={setField(key)}
        onClear={clearField(key)}
        required={required}
        disabled={isProcessing}
        error={fieldErrors[key]}
        modified={isModified}
        noteValue={isModified ? form[noteKey] : undefined}
        onNoteChange={isModified ? setField(noteKey) : undefined}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-8">
            <CalendarIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex flex-col gap-0.5 text-left">
              {employeeDisplayName ? (
                <>
                  <span className="text-xs font-medium tracking-wide text-muted-foreground">
                    {t('punch.editFor')}
                  </span>
                  <span className="text-base font-semibold leading-snug break-words text-foreground">
                    {employeeDisplayName}
                  </span>
                </>
              ) : (
                <span className="text-base font-semibold leading-snug text-foreground">
                  {t('punch.editTitle')}
                </span>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>{t('punch.editSubtitle')}</DialogDescription>
        </DialogHeader>

        {detailQuery.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : t('punch.loadDetailsFailed')}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit()
            }}
            className="space-y-4"
          >
            {renderTimeField('punchIn', <LogIn className="h-4 w-4 text-emerald-600" />, true)}
            {renderTimeField('breakStart', <Coffee className="h-4 w-4 text-amber-600" />)}
            {renderTimeField('breakEnd', <Coffee className="h-4 w-4 text-amber-600" />)}
            {renderTimeField('punchOut', <LogOut className="h-4 w-4 text-rose-600" />)}

            {validationError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {validationError}
              </div>
            )}

            <Separator />

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isProcessing}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {t('common.update')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface TimeFieldProps {
  id: string
  label: string
  noteLabel: string
  icon: React.ReactNode
  value: string
  onChange: (value: string) => void
  onClear: () => void
  required?: boolean
  disabled?: boolean
  error?: string
  modified?: boolean
  /** If undefined the note row is hidden. */
  noteValue?: string
  onNoteChange?: (value: string) => void
  noteError?: string
}

function TimeField({
  id,
  label,
  noteLabel,
  icon,
  value,
  onChange,
  onClear,
  required,
  disabled,
  error,
  modified,
  noteValue,
  onNoteChange,
  noteError,
}: TimeFieldProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('space-y-1.5 rounded-lg', modified && 'rounded-lg border border-primary/30 bg-primary/5 p-3')}>
      <Label htmlFor={id} className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
        {modified && (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
            {t('common.modified')}
          </span>
        )}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={id}
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={cn(
            'min-w-0 flex-1 font-mono',
            !value && 'text-muted-foreground',
            error && 'border-destructive focus-visible:ring-destructive/30',
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClear}
          disabled={disabled || !value || required}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t('punch.clearField', { field: label })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
      {noteValue !== undefined && onNoteChange && (
        <div className="space-y-1">
          <Label htmlFor={`${id}_note`} className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <StickyNote className="h-3 w-3" />
            {noteLabel} <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${id}_note`}
            type="text"
            placeholder={t('punch.whyChangedField', { field: label.toLowerCase() })}
            maxLength={254}
            value={noteValue}
            onChange={(e) => onNoteChange(e.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(noteError)}
            className={cn('text-xs', noteError && 'border-destructive focus-visible:ring-destructive/30')}
          />
          {noteError && (
            <p className="flex items-center gap-1 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {noteError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
