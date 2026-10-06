'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowLeftToLine,
  ArrowRightFromLine,
  Calendar,
  CalendarOff,
  Check,
  Lock,
  MoveHorizontal,
  X,
} from 'lucide-react'
import type { DateRange, Matcher } from 'react-day-picker'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  isInvoiceDateMode,
  openRangeDay,
  type InvoiceDateMode,
} from '@/lib/filters/date-range-open-ends'
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

/** Días que abarca «From» (después del elegido, hasta hoy) o «Until» (antes del elegido). */
function openRangeMatcher(mode: InvoiceDateMode, day: Date | undefined): Matcher | Matcher[] {
  if (!day || mode === 'range') return []
  if (mode === 'until') return { before: day }
  const now = new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return { after: day, before: tomorrow }
}

interface DateRangePickerProps {
  value?: DateRange
  /**
   * Con `openEnds`, el segundo argumento dice cómo se eligió: en «From» / «Until» `range.from` es
   * el día elegido y quien llama resuelve el extremo abierto. Sin `openEnds`, siempre `range`.
   */
  onChange?: (range: DateRange | undefined, mode?: InvoiceDateMode) => void
  /**
   * Opt-in (solo Invoices): fila «Range · From · Until» arriba del switch de ignorar. Sin esta prop
   * el componente se ve y funciona exactamente como antes.
   */
  openEnds?: boolean
  /** Modo actual (con `openEnds`): define el texto del botón y el día que abre el calendario. */
  mode?: InvoiceDateMode
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
  openEnds,
  mode,
}: DateRangePickerProps) {
  const { t, locale } = useTranslation()
  const dayPickerLocale = locale === 'es' ? esDayPicker : enUSDayPicker
  const resolvedPresets = presets ?? getDateRangePresets(t)
  const resolvedPlaceholder = placeholder ?? t('filters.selectDates')

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>(value)
  const [draftIgnored, setDraftIgnored] = useState(Boolean(ignored))
  const currentMode: InvoiceDateMode = openEnds && mode ? mode : 'range'
  const [draftMode, setDraftMode] = useState<InvoiceDateMode>(currentMode)
  const [draftDay, setDraftDay] = useState<Date | undefined>(openRangeDay(currentMode, value))

  useEffect(() => {
    setMounted(true)
  }, [])

  // Celular (por debajo de sm, 640 px): el calendario muestra un solo mes.
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsPhone(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Forzado desde afuera: el botón muestra el candado y el popover no abre.
  const effectiveIgnored = Boolean(ignorable && (ignored || ignoreLocked))
  const frozen = Boolean(ignorable && ignoreLocked)

  const handleOpenChange = (nextOpen: boolean) => {
    if (frozen) return
    if (nextOpen) {
      setDraft(value)
      setDraftIgnored(Boolean(ignored))
      setDraftMode(currentMode)
      setDraftDay(openRangeDay(currentMode, value))
    }
    setOpen(nextOpen)
  }

  // Al pasar a «From» / «Until» se arranca del extremo que corresponde del rango que había.
  const handleModeChange = (next: string) => {
    if (!isInvoiceDateMode(next)) return
    if (next !== 'range' && draftMode === 'range') setDraftDay(openRangeDay(next, draft))
    if (next === 'range' && draftMode !== 'range' && draftDay) setDraft({ from: draftDay, to: draftDay })
    setDraftMode(next)
  }
  const singleDay = draftMode !== 'range'

  const activePresetKey = mounted && currentMode === 'range' ? matchPreset(value) : null
  const showPresets = resolvedPresets.length > 0

  const handlePreset = (preset: DateRangePreset) => {
    const range = resolvePresetRange(preset)
    onChange?.(range, 'range')
    setOpen(false)
  }

  const handleApply = () => {
    if (singleDay) {
      onChange?.(draftDay ? { from: draftDay, to: draftDay } : undefined, draftMode)
    } else {
      onChange?.(draft, 'range')
    }
    if (ignorable) onIgnoredChange?.(draftIgnored)
    setOpen(false)
  }

  const handleClear = () => {
    onChange?.(undefined, 'range')
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
          {mounted && currentMode !== 'range' && openRangeDay(currentMode, value) ? (
            <span className="text-foreground tabular-nums">
              {t(currentMode === 'from' ? 'filters.dateModeFromButton' : 'filters.dateModeUntilButton', {
                date: format(openRangeDay(currentMode, value)!, 'MM/dd/yyyy'),
              })}
            </span>
          ) : mounted && value?.from ? (
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
      <PopoverContent
        // En todos los tamaños: nunca más alto que lo visible, con scroll vertical adentro y la fila
        // Clear / Apply pegada abajo (en una ventana baja se abría hacia arriba y tapaba el mes y las
        // flechas). Celular (< sm): además, nunca más ancho que la pantalla.
        className="w-auto max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overflow-x-hidden p-0 max-sm:w-[calc(100vw-1rem)]"
        align="start"
        collisionPadding={8}
      >
        <div className="flex flex-col sm:flex-row">
          {showPresets && (
            <div
              className={cn(
                'flex shrink-0 flex-row flex-wrap gap-1 border-b border-border p-2 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r sm:p-3',
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

          <div className="flex min-w-0 flex-col">
            <div className={cn(datesMuted && 'pointer-events-none opacity-40')}>
              {singleDay ? (
                <CalendarComponent
                  mode="single"
                  selected={draftDay}
                  onSelect={setDraftDay}
                  defaultMonth={draftDay}
                  numberOfMonths={isPhone ? 1 : numberOfMonths}
                  // Celular: días un poco más chicos para que el mes entre entero en pantallas angostas.
                  className="max-sm:p-2 max-sm:[--cell-size:--spacing(7)]"
                  locale={dayPickerLocale}
                  disabled={datesMuted ? true : undefined}
                  // Los días que entran se pintan como el medio de un rango (MAQUETA-selector-fechas):
                  // «From» del día siguiente hasta hoy; «Until» todos los anteriores al elegido.
                  modifiers={{ openRange: openRangeMatcher(draftMode, draftDay) }}
                  modifiersClassNames={{
                    openRange:
                      'rounded-none [&>button]:rounded-none [&>button]:bg-accent [&>button]:text-accent-foreground',
                  }}
                />
              ) : (
                <CalendarComponent
                  mode="range"
                  selected={draft}
                  onSelect={setDraft}
                  defaultMonth={draft?.from}
                  numberOfMonths={isPhone ? 1 : numberOfMonths}
                  // Celular: días un poco más chicos para que el mes entre entero en pantallas angostas.
                  className="max-sm:p-2 max-sm:[--cell-size:--spacing(7)]"
                  locale={dayPickerLocale}
                  disabled={
                    datesMuted
                      ? true
                      : maxRangeYears === 1 && draft?.from
                        ? { after: maxInclusiveHastaFromDesde(draft.from) }
                        : undefined
                  }
                />
              )}
            </div>

            {openEnds && (
              <div
                className={cn(
                  'flex flex-col items-stretch gap-1.5 border-t border-border px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3',
                  datesMuted && 'pointer-events-none opacity-40',
                )}
              >
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={draftMode}
                  onValueChange={handleModeChange}
                  disabled={datesMuted}
                  className="w-full shrink-0 sm:w-fit"
                  aria-label={t('filters.dateRange')}
                >
                  <ToggleGroupItem value="range" className="cursor-pointer gap-1.5 px-3">
                    <MoveHorizontal className="h-3.5 w-3.5" aria-hidden />
                    {t('filters.dateModeRange')}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="from" className="cursor-pointer gap-1.5 px-3">
                    <ArrowRightFromLine className="h-3.5 w-3.5" aria-hidden />
                    {t('filters.dateModeFrom')}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="until" className="cursor-pointer gap-1.5 px-3">
                    <ArrowLeftToLine className="h-3.5 w-3.5" aria-hidden />
                    {t('filters.dateModeUntil')}
                  </ToggleGroupItem>
                </ToggleGroup>
                {singleDay ? (
                  <span className="text-left text-[11px] leading-tight text-muted-foreground sm:max-w-[26ch] sm:text-right">
                    {t(draftMode === 'from' ? 'filters.dateModeFromHelp' : 'filters.dateModeUntilHelp')}
                  </span>
                ) : null}
              </div>
            )}

            {ignorable && (
              <div
                className={cn(
                  'flex flex-col items-start gap-1.5 border-t border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3',
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
                  <span className="text-left text-[11px] leading-tight text-muted-foreground sm:max-w-[26ch] sm:text-right">
                    {ignoreHint}
                  </span>
                ) : null}
              </div>
            )}

            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-border bg-popover px-3 py-2">
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
                disabled={(singleDay ? !draftDay : !draft?.from) && !draftIgnored}
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
