'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import { Calendar } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { enUS as enUSDayPicker, es as esDayPicker } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  matchPreset,
  resolvePresetRange,
  type DateRangePreset,
} from '@/lib/filters/date-range-presets'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getDateRangePresets } from '@/lib/i18n/label-helpers'

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  numberOfMonths?: number
  /** Presets que se muestran en el panel lateral. Pasar [] para ocultarlos. */
  presets?: DateRangePreset[]
}

export function DateRangePicker({
  value,
  onChange,
  placeholder,
  className,
  numberOfMonths = 2,
  presets,
}: DateRangePickerProps) {
  const { t, locale } = useTranslation()
  const dateFnsLocale = locale === 'es' ? es : enUS
  const dayPickerLocale = locale === 'es' ? esDayPicker : enUSDayPicker
  const resolvedPresets = presets ?? getDateRangePresets(t)
  const resolvedPlaceholder = placeholder ?? t('filters.selectDates')

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>(value)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft(value)
    setOpen(nextOpen)
  }

  const activePresetKey = mounted ? matchPreset(value) : null
  const showPresets = resolvedPresets.length > 0

  const handlePreset = (preset: DateRangePreset) => {
    const range = resolvePresetRange(preset)
    onChange?.(range)
    setOpen(false)
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
          variant="outline"
          className={cn(
            'gap-2 border-border bg-background/50 hover:bg-background min-w-[180px] transition-colors',
            className,
          )}
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {mounted && value?.from ? (
            value.to ? (
              <span className="text-foreground">
                {format(value.from, 'MMM dd', { locale: dateFnsLocale })} -{' '}
                {format(value.to, 'MMM dd', { locale: dateFnsLocale })}
              </span>
            ) : (
              <span className="text-foreground">
                {format(value.from, 'MMM dd, yyyy', { locale: dateFnsLocale })}
              </span>
            )
          ) : (
            <span className="text-muted-foreground">{resolvedPlaceholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {showPresets && (
            <div className="flex shrink-0 flex-row gap-1 border-b border-border p-2 sm:flex-col sm:border-b-0 sm:border-r sm:p-3">
              {resolvedPresets.map((preset) => {
                const isActive = activePresetKey === preset.key
                return (
                  <Button
                    key={preset.key}
                    variant={isActive ? 'default' : 'ghost'}
                    size="sm"
                    className={cn(
                      'justify-start whitespace-nowrap text-sm font-normal',
                      !isActive && 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => handlePreset(preset)}
                  >
                    {preset.label}
                  </Button>
                )
              })}
            </div>
          )}

          <div className="flex flex-col">
            <CalendarComponent
              mode="range"
              selected={draft}
              onSelect={setDraft}
              defaultMonth={draft?.from}
              numberOfMonths={numberOfMonths}
              locale={dayPickerLocale}
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
              <Button size="sm" onClick={handleApply} disabled={!draft?.from}>
                {t('common.apply')}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
