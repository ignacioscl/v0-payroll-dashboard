'use client'

import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { ErrorStatus } from '@/lib/ttk/error-status'
import { cn } from '@/lib/utils'

/**
 * Barra del Dashboard con el eje pendiente / corregido como pestañas con su total.
 *
 * Reemplaza al `ErrorStatusToggle` chico de la derecha, que no se encontraba: la
 * barra va en el azul marino del ícono de Total Punches y cada pestaña muestra
 * cuántos hay en ese estado, así se lee sin tener que cambiar.
 */
export function ErrorStatusBar({
  title,
  hint,
  pendingTotal,
  correctedTotal,
  loading = false,
}: {
  title: string
  hint: string
  pendingTotal: number
  correctedTotal: number
  loading?: boolean
}) {
  const { t } = useTranslation()
  const { errorStatus, setErrorStatus } = useFilters()

  const tabs: { value: ErrorStatus; label: string; total: number; dot: string; line: string }[] = [
    {
      value: 'pending',
      label: t('punch.errorStatusPending'),
      total: pendingTotal,
      dot: 'bg-amber-400',
      line: 'after:bg-amber-400',
    },
    {
      value: 'corrected',
      label: t('punch.errorStatusCorrected'),
      total: correctedTotal,
      dot: 'bg-emerald-400',
      line: 'after:bg-emerald-400',
    },
  ]

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-[image:var(--icon-navy)] py-2 pl-5 pr-2 shadow-[var(--shadow-navy)]">
      <div className="mr-auto min-w-0 py-1">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-slate-300">{hint}</p>
      </div>
      <div role="radiogroup" aria-label={t('punch.errorStatus')} className="flex items-center gap-1.5">
        {tabs.map((tab) => {
          const on = errorStatus === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setErrorStatus(tab.value)}
              className={cn(
                'relative flex cursor-pointer items-center gap-2.5 rounded-xl px-5 pb-3 pt-2.5 text-[15px] font-semibold transition-colors',
                "after:absolute after:inset-x-5 after:bottom-1.5 after:h-[3px] after:rounded-full after:content-['']",
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
                on
                  ? cn('bg-white/10 text-white', tab.line)
                  : 'text-slate-400 after:bg-transparent hover:bg-white/5 hover:text-white',
              )}
            >
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tab.dot, !on && 'opacity-50')} />
              {tab.label}
              <span
                className={cn(
                  'text-2xl font-extrabold tabular-nums',
                  on ? 'text-white' : 'text-slate-400',
                )}
              >
                {loading ? '…' : tab.total.toLocaleString('en-US')}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
