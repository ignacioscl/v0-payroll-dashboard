'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Calendar, CalendarOff, Check, Lock, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { enUS as enUSDayPicker, es as esDayPicker } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  matchPreset,
  resolvePresetRange,
  type DateRangePreset,
} from '@/lib/filters/date-range-presets'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getDateRangePresets } from '@/lib/i18n/label-helpers'

/** Inclusive max `to` for a 1-year cap: day before the next anniversary of `from`. */
export function maxInclusiveHastaFromDesde(from: Date): Date {
  const anniversary = new Date(from.getFullYear() + 1, from.getMonth(), from.getDate())
  const max = new Date(anniversary)
  max.setDate(max.getDate() - 1)
  max.setHours(23, 59, 59, 999)
  return max
}

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  numberOfMonths?: number
  /** Presets que se muestran en el panel lateral. Pasar [] para ocultarlos. */
  presets?: DateRangePreset[]
  /**
   * When 1, the user cannot pick a `to` after the day before the anniversary of `from`
   * (Punch Report D8). Inherited ranges wider than that still display as-is.
   */
  maxRangeYears?: number
  /**
   * Opt-in: adds the "ignore date range" switch inside the popover. Without it the
   * component renders exactly as it did before, so the screens that don't pass it
   * (Schedule, Punch, Issues, Dashboard) are untouched.
   */
  ignorable?: boolean
  ignored?: boolean
  onIgnoredChange?: (next: boolean) => void
  /** Forced on from outside (Invoices: searching by invoice # or employee). Can't be turned off. */
  ignoreLocked?: boolean
  /** Why it is ignored / what ignoring does. Shown next to the switch. */
  ignoreHint?: string
}

export function DateRangePicker({
  value,
  onChange,
  placeholder,
  className,
  numberOfMonths = 2,
  presets,
  maxRangeYears,
  ignorable,
  ignored,
  onIgnoredChange,
  ignoreLocked,
  ignoreHint,
}: DateRangePickerProps) {
  const { t, locale } = useTranslation()
  const dayPickerLocale = locale === 'es' ? esDayPicker : enUSDayPicker
  const resolvedPresets = presets ?? getDateRangePresets(t)
  const resolvedPlaceholder = placeholder ?? t('filters.selectDates')

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>(value)
  const [draftIgnored, setDraftIgnored] = useState(Boolean(ignored))

  useEffect(() => {
    setMounted(true)
  }, [])

  // Forzado desde afuera: el botón muestra el candado y el popover no abre.
  const effectiveIgnored = Boolean(ignorable && (ignored || ignoreLocked))
  const frozen = Boolean(ignorable && ignoreLocked)

  const handleOpenChange = (nextOpen: boolean) => {
    if (frozen) return
    if (nextOpen) {
      setDraft(value)
      setDraftIgnored(Boolean(ignored))
    }
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
    if (ignorable) onIgnoredChange?.(draftIgnored)
    setOpen(false)
  }

  const handleClear = () => {
    onChange?.(undefined)
    setDraft(undefined)
    if (ignorable) {
      onIgnoredChange?.(false)
      setDraftIgnored(false)
    }
    setOpen(false)
  }

  const trigger = (
    <Button
      variant="outline"
      aria-disabled={frozen || undefined}
      className={cn(
        'gap-2 border-border bg-background/50 hover:bg-background min-w-[180px] transition-colors',
        // Ignorado: el mismo ámbar con el que ya se marcan los filtros trabados.
        effectiveIgnored &&
          'border-amber-500/40 bg-amber-500/10 text-amber-900 hover:bg-amber-500/15 dark:text-amber-200',
        frozen && 'cursor-not-allowed',
        className,
      )}
    >
      {mounted && effectiveIgnored ? (
        <>
          {frozen ? (
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <CalendarOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
          <span>{t('filters.dateRangeIgnored')}</span>
        </>
      ) : (
        <>
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {mounted && value?.from ? (
            value.to ? (
              <span className="text-foreground tabular-nums">
                {format(value.from, 'MM/dd/yyyy')} – {format(value.to, 'MM/dd/yyyy')}
              </span>
            ) : (
              <span className="text-foreground tabular-nums">
                {format(value.from, 'MM/dd/yyyy')}
              </span>
            )
          ) : (
            <span className="text-muted-foreground">{resolvedPlaceholder}</span>
          )}
        </>
      )}
    </Button>
  )

  // Con el rango ignorado, elegir fechas no tendría efecto: calendario y presets se apagan.
  const datesMuted = Boolean(ignorable && draftIgnored)

  // El Tooltip va POR AFUERA del PopoverTrigger. Al revés, `asChild` le entrega el onClick
  // y el ref a `Tooltip.Root`, que no es un nodo del DOM: el click se pierde y no abre.
  const triggerNode = <PopoverTrigger asChild>{trigger}</PopoverTrigger>

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {mounted && effectiveIgnored && ignoreHint ? (
        <Tooltip>
          <TooltipTrigger asChild>{triggerNode}</TooltipTrigger>
          <TooltipContent>{ignoreHint}</TooltipContent>
        </Tooltip>
      ) : (
        triggerNode
      )}
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {showPresets && (
            <div
              className={cn(
                'flex shrink-0 flex-row gap-1 border-b border-border p-2 sm:flex-col sm:border-b-0 sm:border-r sm:p-3',
                datesMuted && 'pointer-events-none opacity-40',
              )}
            >
              {resolvedPresets.map((preset) => {
                const isActive = activePresetKey === preset.key
                return (
                  <Button
                    key={preset.key}
                    variant={isActive ? 'default' : 'ghost'}
                    size="sm"
                    disabled={datesMuted}
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
            <div className={cn(datesMuted && 'pointer-events-none opacity-40')}>
              <CalendarComponent
                mode="range"
                selected={draft}
                onSelect={setDraft}
                defaultMonth={draft?.from}
                numberOfMonths={numberOfMonths}
                locale={dayPickerLocale}
                disabled={
                  datesMuted
                    ? true
                    : maxRangeYears === 1 && draft?.from
                      ? { after: maxInclusiveHastaFromDesde(draft.from) }
                      : undefined
                }
              />
            </div>

            {ignorable && (
              <div
                className={cn(
                  'flex items-center justify-between gap-3 border-t border-border px-3 py-2',
                  draftIgnored && 'bg-amber-500/10',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Switch
                    id="date-range-ignore"
                    checked={draftIgnored}
                    onCheckedChange={setDraftIgnored}
                  />
                  <Label
                    htmlFor="date-range-ignore"
                    className="cursor-pointer text-sm font-normal"
                  >
                    {t('filters.ignoreDateRange')}
                  </Label>
                </div>
                {ignoreHint ? (
                  <span className="max-w-[26ch] text-right text-[11px] leading-tight text-muted-foreground">
                    {ignoreHint}
                  </span>
                ) : null}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border px-3 py-2 gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleClear}
              >
                <X />
                {t('common.clear')}
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!draft?.from && !draftIgnored}
              >
                <Check />
                {t('common.apply')}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
