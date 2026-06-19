'use client'

import { AlertTriangle, StickyNote, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { PunchNoteKey, PunchTimeKey } from '@/lib/ttk/punch-form-utils'
import { getPunchFieldLabel } from '@/lib/i18n/label-helpers'
import { useTranslation } from '@/lib/i18n/locale-context'

export interface PunchTimeFieldProps {
  id: PunchTimeKey
  icon: React.ReactNode
  value: string
  onChange: (value: string) => void
  onClear: () => void
  required?: boolean
  disabled?: boolean
  error?: string
  modified?: boolean
  noteValue?: string
  onNoteChange?: (value: string) => void
  noteError?: string
  alwaysShowNote?: boolean
}

export function PunchTimeField({
  id,
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
  alwaysShowNote,
}: PunchTimeFieldProps) {
  const { t } = useTranslation()
  const label = getPunchFieldLabel(t, id)
  const showNote = alwaysShowNote || (noteValue !== undefined && onNoteChange)

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
            'font-mono',
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
      {showNote && onNoteChange && (
        <div className="space-y-1">
          <Label htmlFor={`${id}_note`} className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <StickyNote className="h-3 w-3" />
            {getPunchFieldLabel(t, `${id}Note` as PunchNoteKey)}{' '}{alwaysShowNote && id === 'punchIn' ? <span className="text-destructive">*</span> : null}
          </Label>
          <Input
            id={`${id}_note`}
            type="text"
            placeholder={t('punch.noteForField', { field: label.toLowerCase() })}
            maxLength={254}
            value={noteValue ?? ''}
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
