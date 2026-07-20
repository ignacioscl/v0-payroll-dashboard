'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-context'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
  ChevronDown,
  Sparkles,
  ArrowLeft,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { userAvatarUrl } from '@/lib/face/face-proxy-url'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAccessDailyPunch } from '@/lib/auth/ttk-permissions'
import { canAccessBusinessKpis, canAccessBillingInvoices } from '@/lib/auth/payroll-access'
import { canViewRoles } from '@/lib/auth/roles-permissions'
import { getVisibleNavigation, isDevEnvironment } from '@/lib/navigation'
import { getAppTitle } from '@/lib/branding'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { SrsMeUser } from '@/lib/auth/types'

function userInitials(nombre: string) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function profileRoleLabel(
  user: SrsMeUser | null,
  systemAdminLabel: string,
) {
  if (!user) return '—'
  if (user.isSystemAdmin) {
    return user.rolSystemV2Name ?? systemAdminLabel
  }
  return user.rolSystemV2Name ?? user.dealerName ?? '—'
}

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

// Shared nav content used by both desktop aside and mobile sheet
function SidebarInner({
  isMobileSheet = false,
  onNavigate,
}: {
  isMobileSheet?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const { collapsed, setCollapsed } = useSidebar()
  const { user, hasPermission } = useSrsMe()
  const { t } = useTranslation()
  const [profileOpen, setProfileOpen] = useState(false)

  // On mobile sheet, always treat as expanded
  const effectiveCollapsed = isMobileSheet ? false : collapsed

  const canAccessTtk = canAccessDailyPunch(hasPermission, user?.isSystemAdmin)
  const navigation = getVisibleNavigation({
    isDev: isDevEnvironment(),
    canAccessTtk,
    canAccessProdKpis: canAccessBusinessKpis(user, hasPermission),
    canAccessBillingInvoices: canAccessBillingInvoices(user, hasPermission),
    canViewRoles: canViewRoles(hasPermission, user?.isSystemAdmin),
    isCompanyTypeCompany: Boolean(user?.isCompanyTypeCompany),
    t,
  })

  const displayName = user?.nombre ?? t('sidebar.user')
  const displayRole =
    user?.rolSystemV2Name ?? user?.dealerName ?? user?.email ?? 'SRS'
  const appTitle = getAppTitle(user)
  const initials = userInitials(displayName)
  const photoSrc = userAvatarUrl(user)

  return (
    <div className="flex h-full flex-col">
      {/* Header with Logo and Collapse Button */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-3">
        <AnimatePresence mode="wait">
          {!effectiveCollapsed ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3"
            >
              <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sidebar-foreground text-sm tracking-tight">
                  {appTitle}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('sidebar.appSubtitle')}
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 mx-auto"
            >
              <Sparkles className="h-5 w-5" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapse Button — desktop only */}
        {!isMobileSheet && !effectiveCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition-all duration-200"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.collapseMenu')}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Expand Button when collapsed — desktop only */}
      {!isMobileSheet && effectiveCollapsed && (
        <div className="flex justify-center py-3 border-b border-sidebar-border">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition-all duration-200"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.expandMenu')}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/25'
                    : 'text-white/80 hover:bg-white/15 hover:text-white',
                  effectiveCollapsed && 'justify-center px-0'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full shadow-sm shadow-white/40"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}

                <Icon
                  className={cn(
                    'h-5 w-5 shrink-0 transition-all duration-200',
                    isActive
                      ? 'text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.45)]'
                      : 'text-white/70 group-hover:text-white group-hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.35)] group-hover:scale-110'
                  )}
                />
                <AnimatePresence>
                  {!effectiveCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            )

            const childItems = item.children ?? []

            if (effectiveCollapsed) {
              return (
                <div key={item.href} className="space-y-1">
                  <Tooltip>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                  {childItems.map((child) => {
                    const childActive = pathname === child.href
                    const ChildIcon = child.icon
                    return (
                      <Tooltip key={child.href}>
                        <TooltipTrigger asChild>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            className={cn(
                              'group relative flex items-center justify-center rounded-lg px-0 py-2 text-sm font-medium transition-all duration-200',
                              childActive
                                ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/25'
                                : 'text-white/60 hover:bg-white/15 hover:text-white'
                            )}
                          >
                            <ChildIcon className="h-4 w-4 shrink-0" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {child.name}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              )
            }

            if (childItems.length === 0) return linkContent

            return (
              <div key={item.href} className="space-y-1">
                {linkContent}
                <div className="ml-5 space-y-1 border-l border-white/15 pl-3">
                  {childItems.map((child) => {
                    const childActive = pathname === child.href
                    const ChildIcon = child.icon
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={cn(
                          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200',
                          childActive
                            ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/25'
                            : 'text-white/70 hover:bg-white/15 hover:text-white'
                        )}
                      >
                        <ChildIcon className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap overflow-hidden">{child.name}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </nav>

      {/* User Profile Section */}
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200',
                effectiveCollapsed && 'justify-center px-0'
              )}
            >
              <Avatar className="h-8 w-8 border-2 border-primary/20 shadow-lg shadow-primary/10">
                <AvatarImage src={photoSrc} alt={displayName} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!effectiveCollapsed && (
                <>
                  <div className="flex flex-col items-start flex-1 min-w-0">
                    <span className="text-sidebar-foreground font-medium text-sm truncate w-full">
                      {displayName}
                    </span>
                    <span className="text-sky-100 text-xs truncate w-full">
                      {displayRole}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white/60" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={effectiveCollapsed ? 'right' : 'top'}
            align={effectiveCollapsed ? 'start' : 'center'}
            className="w-56"
          >
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email || displayRole}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onSelect={(e) => {
                e.preventDefault()
                setProfileOpen(true)
              }}
            >
              <User className="h-4 w-4" />
              <span>{t('sidebar.profile')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2 cursor-pointer">
              <a href="/api/sso/to-php">
                <ArrowLeft className="h-4 w-4" />
                <span>{t('sidebar.backToLegacy')}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault()
                window.location.href = '/api/auth/logout'
              }}
            >
              <LogOut className="h-4 w-4" />
              <span>{t('sidebar.logOut')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('profile.title')}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-primary/20">
                <AvatarImage src={photoSrc} alt={displayName} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-semibold">{displayName}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {profileRoleLabel(user, t('profile.systemAdmin'))}
                </p>
              </div>
            </div>
            <div className="grid gap-4 pt-2">
              <ProfileField label={t('profile.email')} value={user?.email} />
              <ProfileField label={t('profile.employeeId')} value={user?.codigoInterno} />
              <ProfileField label={t('profile.role')} value={profileRoleLabel(user, t('profile.systemAdmin'))} />
              <ProfileField label={t('profile.dealer')} value={user?.dealerName} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export function Sidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar()
  const { collapsed } = useSidebar()
  const { t } = useTranslation()

  return (
    <TooltipProvider delayDuration={0}>
      {/* Desktop sidebar — hidden on mobile */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar hidden md:block"
      >
        <SidebarInner />
      </motion.aside>

      {/* Mobile sidebar — Sheet overlay, no minimized state */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-[260px] bg-sidebar border-sidebar-border [&>button]:text-white/60 [&>button]:hover:text-white"
        >
          <SheetTitle className="sr-only">{t('sidebar.navigationMenu')}</SheetTitle>
          <SidebarInner
            isMobileSheet
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}
