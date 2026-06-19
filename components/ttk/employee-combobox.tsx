'use client'

import * as React from 'react'
import { ChevronsUpDown, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import { useTranslation } from '@/lib/i18n/locale-context'

interface EmployeeComboboxProps {
  value: TtkEmployeeOption | null
  onChange: (value: TtkEmployeeOption | null) => void
  searchTerm: string
  onSearchTermChange: (term: string) => void
  employees: TtkEmployeeOption[] | undefined
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
  minSearchChars?: number
  className?: string
  /** When false, the dropdown shows a "pick a dealer first" prerequisite gate. */
  dealerSelected?: boolean
}

/** Uppercase initials from a "First Last" style name. */
function getInitials(name: string): string {
  const tokens = name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
  if (tokens.length === 0) return '?'
  if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase()
  return (tokens[0]![0]! + tokens[tokens.length - 1]![0]!).toUpperCase()
}

/** Stable gradient palette for the avatar so each employee keeps the same color. */
function getAvatarTone(id: number): string {
  const tones = [
    'from-blue-500 to-indigo-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-fuchsia-500 to-pink-500',
    'from-cyan-500 to-sky-500',
    'from-violet-500 to-purple-500',
    'from-rose-500 to-red-500',
    'from-lime-500 to-emerald-500',
  ]
  return tones[Math.abs(id) % tones.length]!
}

function EmployeeAvatar({
  id,
  name,
  size = 'md',
}: {
  id: number
  name: string
  size?: 'sm' | 'md'
}) {
  const dims = size === 'sm' ? 'size-7 text-[10px]' : 'size-8 text-xs'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm ring-1 ring-black/5',
        getAvatarTone(id),
        dims,
      )}
      aria-hidden
    >
      {getInitials(name)}
    </span>
  )
}

/**
 * Employee picker — thin domain wrapper around `SearchableCombobox` that adds:
 *   • Gradient avatar with initials
 *   • Subtitles in the trigger and rows
 *   • "Pick a dealer first" prerequisite gate
 */
export function EmployeeCombobox({
  value,
  onChange,
  searchTerm,
  onSearchTermChange,
  employees,
  isLoading = false,
  disabled = false,
  placeholder,
  minSearchChars = 2,
  className,
  dealerSelected = true,
}: EmployeeComboboxProps) {
  const { t } = useTranslation()

  return (
    <SearchableCombobox<TtkEmployeeOption>
      value={value}
      onChange={onChange}
      searchTerm={searchTerm}
      onSearchTermChange={onSearchTermChange}
      items={employees}
      getItemKey={(emp) => emp.id}
      getItemLabel={(emp) => emp.nombre}
      isLoading={isLoading}
      disabled={disabled}
      minSearchChars={minSearchChars}
      placeholder={placeholder ?? t('employeeSearch.select')}
      searchPlaceholder={t('employeeSearch.typeMinChars')}
      preSearchTitle={t('employeeSearch.startTyping')}
      preSearchDescription={t('employeeSearch.enterMinChars', { count: minSearchChars })}
      loadingMessage={t('employeeSearch.searching')}
      emptyTitle={t('employeeSearch.noneFound')}
      emptyDescription={t('employeeSearch.tryDifferent')}
      resultsHeading={
        <span className="flex items-center justify-between gap-2 px-1">
          <span>{t('employeeSearch.employees')}</span>
          {employees && (
            <span className="text-[10px] font-normal text-muted-foreground/80">
              {t('employeeSearch.results', { count: employees.length })}
            </span>
          )}
        </span>
      }
      prerequisite={{
        met: dealerSelected,
        title: t('employeeSearch.pickDealerFirst'),
        description: t('dealer.selectInHeaderToSearch'),
        icon: (
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="size-5" />
          </div>
        ),
      }}
      className={className}
      renderSelectedTrigger={({ item, clear }) => (
        <>
          <EmployeeAvatar id={item.id} name={item.nombre} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-foreground">{item.nombre}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {t('employeeSearch.clickToChange')}
            </span>
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label={t('employeeSearch.clearSelected')}
            onClick={clear}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') clear(e)
            }}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </span>
        </>
      )}
      renderEmptyTrigger={({ placeholder: p }) => (
        <>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-muted-foreground">{p}</span>
            <span className="truncate text-[11px] text-muted-foreground/80">
              {t('employeeSearch.searchByName')}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </>
      )}
      renderItem={({ item }) => (
        <>
          <EmployeeAvatar id={item.id} name={item.nombre} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {item.nombre}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              ID #{item.id}
            </span>
          </span>
        </>
      )}
    />
  )
}
