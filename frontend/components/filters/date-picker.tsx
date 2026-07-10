'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Calendar } from 'lucide-react'
import { enUS as enUSDayPicker, es as esDayPicker } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

interface DatePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Optional upper/lower bounds for the calendar. */
  fromDate?: Date
  toDate?: Date
}

/**
 * Single-date picker — same trigger/popover/calendar chrome as DateRangePicker.
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  fromDate,
  toDate,
}: DatePickerProps) {
  const { t, locale } = useTranslation()
  const dayPickerLocale = locale === 'es' ? esDayPicker : enUSDayPicker
  const resolvedPlaceholder = placeholder ?? t('filters.selectDate')

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Date | undefined>(value)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft(value)
    setOpen(nextOpen)
  }

  const handleApply = () => {
    onChange?.(draft)
    setOpen(false)
  }

  const handleClear = () => {
    onChange?.(undefined)
    setDraft(undefined)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-9 gap-2 border-border bg-background/50 hover:bg-background min-w-[148px] transition-colors',
            className,
          )}
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {mounted && value ? (
            <span className="text-foreground tabular-nums">{format(value, 'MM/dd/yyyy')}</span>
          ) : (
            <span className="text-muted-foreground">{resolvedPlaceholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col">
          <CalendarComponent
            mode="single"
            selected={draft}
            onSelect={setDraft}
            defaultMonth={draft ?? value}
            locale={dayPickerLocale}
            disabled={
              fromDate || toDate
                ? [
                    ...(fromDate ? [{ before: fromDate }] : []),
                    ...(toDate ? [{ after: toDate }] : []),
                  ]
                : undefined
            }
          />
          <div className="flex items-center justify-between border-t border-border px-3 py-2 gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleClear}
            >
              {t('common.clear')}
            </Button>
            <Button size="sm" onClick={handleApply} disabled={!draft}>
              {t('common.apply')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
