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

type TimeKey = 'punchIn' | 'breakStart' | 'breakEnd' | 'punchOut'
type NoteKey = 'punchInNote' | 'breakStartNote' | 'breakEndNote' | 'punchOutNote'

const TIME_TO_NOTE: Record<TimeKey, NoteKey> = {
  punchIn: 'punchInNote',
  breakStart: 'breakStartNote',
  breakEnd: 'breakEndNote',
  punchOut: 'punchOutNote',
}

const FIELD_LABELS: Record<TimeKey, string> = {
  punchIn: 'Clock In',
  breakStart: 'Break Start',
  breakEnd: 'Break End',
  punchOut: 'Clock Out',
}

interface EditPunchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  punchId: number | string | null
  employeeName?: string
  initial?: Partial<Record<TimeKey, string | null | undefined>>
  onSaved?: () => void
}

type FormState = Record<TimeKey, string> & Record<NoteKey, string>

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

function diffMinutes(from: string, to: string): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return (b - a) / 60_000
}

export function EditPunchDialog({
  open,
  onOpenChange,
  punchId,
  employeeName,
  initial,
  onSaved,
}: EditPunchDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [original, setOriginal] = useState<FormState>(EMPTY_FORM)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TimeKey, string>>>({})

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
  const modifiedTimeFields = useMemo<TimeKey[]>(() => {
    const keys: TimeKey[] = ['punchIn', 'breakStart', 'breakEnd', 'punchOut']
    return keys.filter((k) => form[k] !== original[k])
  }, [form, original])

  /**
   * Full validation, mirroring legacy `ttkSubmit()` ordering rules.
   * Note requirements are enforced server-side via getLogFromTTK (same as legacy).
   */
  const validate = (
    state: FormState,
  ): { generalError: string | null; fieldErrors: Partial<Record<TimeKey, string>> } => {
    const errors: Partial<Record<TimeKey, string>> = {}

    if (!state.punchIn) {
      errors.punchIn = 'Required'
      return { generalError: 'Clock in is required', fieldErrors: errors }
    }

    if (state.punchOut) {
      const d = diffMinutes(state.punchIn, state.punchOut)
      if (d !== null) {
        if (d <= 0) errors.punchOut = 'Must be after Clock In'
        else if (d > 20 * 60) errors.punchOut = 'More than 20 hours after Clock In'
      }
    }

    if (state.breakStart) {
      const d = diffMinutes(state.punchIn, state.breakStart)
      if (d !== null && d <= 0) errors.breakStart = 'Must be after Clock In'
      if (state.punchOut && !errors.punchOut) {
        const d2 = diffMinutes(state.breakStart, state.punchOut)
        if (d2 !== null && d2 <= 0) errors.breakStart = 'Must be before Clock Out'
      }
    }

    if (state.breakEnd) {
      if (!state.breakStart) {
        errors.breakEnd = 'Break Start is required when Break End is set'
      } else {
        const d = diffMinutes(state.breakStart, state.breakEnd)
        if (d !== null && d <= 0) errors.breakEnd = 'Must be after Break Start'
        if (state.punchOut && !errors.punchOut) {
          const d2 = diffMinutes(state.breakEnd, state.punchOut)
          if (d2 !== null && d2 <= 0) errors.breakEnd = 'Must be before Clock Out'
        }
      }
    }

    const firstField = (['punchIn', 'breakStart', 'breakEnd', 'punchOut'] as TimeKey[]).find(
      (k) => errors[k],
    )
    const generalError = firstField
      ? `${FIELD_LABELS[firstField]}: ${errors[firstField]}`
      : null

    return { generalError, fieldErrors: errors }
  }

  const setField = (key: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setValidationError(null)
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const { [key]: _omitted, ...rest } = prev
      return rest
    })
  }

  const clearField = (key: TimeKey) => () => setField(key)('')

  const handleSubmit = async () => {
    if (!punchId) return
    const { generalError, fieldErrors: errs } = validate(form)
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
      toast.success(`Punch updated${saved.usuario?.nombre ? ` — ${saved.usuario.nombre}` : ''}`)
      onOpenChange(false)
      onSaved?.()
    } catch (e: unknown) {
      const message = getSrsErrorMessage(e, 'Failed to save punch')
      toast.error(message)
      setValidationError(message)
    }
  }

  const isProcessing = editMutation.isPending
  const isLoading = detailQuery.isLoading && !detailQuery.data

  const employeeDisplayName = useMemo(() => {
    return (detailQuery.data?.usuario?.nombre ?? employeeName ?? '').trim()
  }, [detailQuery.data?.usuario?.nombre, employeeName])

  const renderTimeField = (key: TimeKey, icon: React.ReactNode, required = false) => {
    const noteKey = TIME_TO_NOTE[key]
    const isModified = modifiedTimeFields.includes(key)
    return (
      <TimeField
        id={key}
        label={FIELD_LABELS[key]}
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
                    Edit Time Tracking:
                  </span>
                  <span className="text-base font-semibold leading-snug break-words text-foreground">
                    {employeeDisplayName}
                  </span>
                </>
              ) : (
                <span className="text-base font-semibold leading-snug text-foreground">
                  Edit Time Tracking
                </span>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>
            Adjust punch times for this shift. If you change a time, add a note explaining why.
          </DialogDescription>
        </DialogHeader>

        {detailQuery.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : 'Could not load punch details.'}
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
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Update
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
  return (
    <div className={cn('space-y-1.5 rounded-lg', modified && 'rounded-lg border border-primary/30 bg-primary/5 p-3')}>
      <Label htmlFor={id} className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
        {modified && (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
            Modified
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
          aria-label={`Clear ${label}`}
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
            {label} Note <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${id}_note`}
            type="text"
            placeholder={`Why did you change ${label.toLowerCase()}?`}
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
