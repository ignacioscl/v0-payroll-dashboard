'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { SrsLoginRoleOption } from '@/lib/auth/types'
import { Building2, ChevronRight, Search } from 'lucide-react'

interface RoleSelectionDialogProps {
  open: boolean
  roles: SrsLoginRoleOption[]
  srsPublicUrl: string
  loading?: boolean
  onSelect: (idUsuarioRolrel: number) => void
}

function resolveLogoSrc(srsPublicUrl: string, logoUrl: string | null) {
  if (!logoUrl) return null
  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
    return logoUrl
  }
  const base = srsPublicUrl.replace(/\/$/, '')
  return `${base}${logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`}`
}

function roleSearchText(role: SrsLoginRoleOption): string {
  return [role.dealerName, role.rolName, role.companyName, role.departmentName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function RoleSelectionDialog({
  open,
  roles,
  srsPublicUrl,
  loading,
  onSelect,
}: RoleSelectionDialogProps) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) {
      setQuery('')
    }
  }, [open])

  const filteredRoles = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return roles
    return roles.filter((role) => roleSearchText(role).includes(needle))
  }, [roles, query])

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className={cn(
          'flex h-[min(85vh,720px)] max-h-[85vh] flex-col gap-0 overflow-hidden p-0',
          'sm:max-w-xl'
        )}
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle>Select your dealer</DialogTitle>
          <DialogDescription>
            You have access to more than one dealer. Choose the same assignment you would use in
            SRS Legacy.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter by dealer, role, or company…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              className="h-10 pl-9"
              autoFocus
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {filteredRoles.length} of {roles.length} shown
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {filteredRoles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No dealers match your search.
            </p>
          ) : (
            <ul className="space-y-2 pb-1">
              {filteredRoles.map((role) => {
                const logoSrc = resolveLogoSrc(srsPublicUrl, role.logoUrl)
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onSelect(role.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border border-border/80 bg-card p-3 text-left',
                        'transition-colors hover:border-primary/40 hover:bg-muted/50',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'disabled:pointer-events-none disabled:opacity-60'
                      )}
                    >
                      <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-muted/60 p-1">
                        {logoSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoSrc}
                            alt=""
                            className="max-h-10 max-w-[64px] object-contain"
                          />
                        ) : (
                          <Building2 className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {role.dealerName || '—'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{role.rolName}</p>
                        {role.departmentName && (
                          <p className="truncate text-xs text-muted-foreground">
                            {role.departmentName}
                          </p>
                        )}
                        {role.companyName && role.companyName !== role.dealerName && (
                          <p className="truncate text-xs text-muted-foreground/80">
                            {role.companyName}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
