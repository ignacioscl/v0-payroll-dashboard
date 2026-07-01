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
  AlertTriangle,
  User,
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
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { useTtkAddPunch } from '@/hooks/use-ttk-add-punch'
import { useTtkEmployeeSearch, type TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import { PunchTimeField } from '@/components/ttk/punch-time-field'
import { EmployeeCombobox } from '@/components/ttk/employee-combobox'
import {
  EMPTY_PUNCH_FORM,
  type PunchFormState,
  type PunchTimeKey,
  validatePunchForm,
  punchFormToAddPayload,
} from '@/lib/ttk/punch-form-utils'
import { useTranslation } from '@/lib/i18n/locale-context'

interface AddPunchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  idDealer: number | null
  dealerName?: string
  onSaved?: () => void
}

export function AddPunchDialog({
  open,
  onOpenChange,
  idDealer,
  dealerName,
  onSaved,
}: AddPunchDialogProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<PunchFormState>(EMPTY_PUNCH_FORM)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<TtkEmployeeOption | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PunchTimeKey, string>>>({})

  const addMutation = useTtkAddPunch()
  const employeesQuery = useTtkEmployeeSearch(employeeSearch, idDealer, open)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY_PUNCH_FORM)
    setEmployeeSearch('')
    setSelectedEmployee(null)
    setValidationError(null)
    setFieldErrors({})
  }, [open])

  const setField = (key: keyof PunchFormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setValidationError(null)
    setFieldErrors((prev) => {
      if (!prev[key as PunchTimeKey]) return prev
      const { [key as PunchTimeKey]: _omitted, ...rest } = prev
      return rest
    })
  }

  const clearField = (key: PunchTimeKey) => () => setField(key)('')

  const handleSubmit = async () => {
    if (!idDealer || idDealer <= 0) {
      setValidationError(t('dealer.selectOnlyOneInHeader'))
      return
    }
    if (!selectedEmployee) {
      setValidationError(t('employeeSearch.select'))
      return
    }

    const { generalError, fieldErrors: errs } = validatePunchForm(form, t)
    setFieldErrors(errs)
    if (generalError) {
      setValidationError(generalError)
      return
    }

    if (!form.punchInNote.trim()) {
      setValidationError(t('punch.clockInNoteRequired'))
      return
    }

    try {
      const saved = await addMutation.mutateAsync(
        punchFormToAddPayload(selectedEmployee.id, idDealer, form),
      )
      toast.success(
        t('punch.created', { name: saved.usuario?.nombre ?? t('common.employee') }),
      )
      onOpenChange(false)
      onSaved?.()
    } catch (e: unknown) {
      const message = getSrsErrorMessage(e, t('punch.createFailed'))
      toast.error(message)
      setValidationError(message)
    }
  }

  const isProcessing = addMutation.isPending
  const title = useMemo(() => {
    const dealer = dealerName ? ` @ ${dealerName}` : ''
    return `${t('punch.addTitle')}${dealer}`
  }, [dealerName, t])

  const renderTimeField = (key: PunchTimeKey, icon: React.ReactNode, required = false) => (
    <PunchTimeField
      id={key}
      icon={icon}
      value={form[key]}
      onChange={setField(key)}
      onClear={clearField(key)}
      required={required}
      disabled={isProcessing}
      error={fieldErrors[key]}
      alwaysShowNote={key === 'punchIn'}
      noteValue={key === 'punchIn' ? form.punchInNote : undefined}
      onNoteChange={key === 'punchIn' ? setField('punchInNote') : undefined}
    />
  )

  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <span className="truncate">{title}</span>
          </DialogTitle>
          <DialogDescription>{t('punch.addSubtitle')}</DialogDescription>
        </DialogHeader>

        {!idDealer ? (
          <p className="text-sm text-muted-foreground">
            {t('dealer.selectOnlyOneInHeader')}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmit()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <User className="h-4 w-4" />
                {t('common.employee')} <span className="text-destructive">*</span>
              </Label>
              <EmployeeCombobox
                value={selectedEmployee}
                onChange={setSelectedEmployee}
                searchTerm={employeeSearch}
                onSearchTermChange={setEmployeeSearch}
                employees={employeesQuery.data}
                isLoading={employeesQuery.isFetching}
                disabled={isProcessing}
                dealerSelected={!!idDealer && idDealer > 0}
              />
            </div>

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
              <Button type="submit" disabled={isProcessing} className="gap-2">
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {t('punch.create')}
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
