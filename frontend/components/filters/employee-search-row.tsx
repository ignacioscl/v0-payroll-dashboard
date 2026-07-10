'use client'

import { cn } from '@/lib/utils'
import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'

/** Uppercase initials from a "First Last" style name. */
export function getEmployeeInitials(name: string): string {
  const tokens = name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
  if (tokens.length === 0) return '?'
  if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase()
  return (tokens[0]![0]! + tokens[tokens.length - 1]![0]!).toUpperCase()
}

/** Stable gradient palette for the avatar so each employee keeps the same color. */
export function getEmployeeAvatarTone(id: number): string {
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

/** Same format as punch issues table: role / department */
export function formatEmployeeRoleLabel(
  employee: Pick<TtkEmployeeOption, 'role' | 'department'>,
): string {
  const parts = [employee.role?.trim(), employee.department?.trim()].filter(Boolean)
  return parts.join(' / ')
}

export function EmployeeSearchRow({
  id,
  name,
  roleLabel,
  size = 'sm',
}: {
  id: number
  name: string
  roleLabel?: string
  size?: 'sm' | 'md'
}) {
  const dims = size === 'sm' ? 'size-7 text-[10px]' : 'size-8 text-xs'
  return (
    <>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm ring-1 ring-black/5',
          getEmployeeAvatarTone(id),
          dims,
        )}
        aria-hidden
      >
        {getEmployeeInitials(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        {roleLabel ? (
          <span className="truncate text-[11px] text-muted-foreground">{roleLabel}</span>
        ) : null}
      </span>
    </>
  )
}
