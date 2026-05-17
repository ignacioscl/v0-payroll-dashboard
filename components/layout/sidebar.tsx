'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-context'
import { motion, AnimatePresence } from 'framer-motion'
import {
  House,
  WarningCircle,
  CalendarX,
  Timer,
  TrendUp,
  Trophy,
  CurrencyDollar,
  CaretLeft,
  CaretRight,
  Gear,
  User,
  SignOut,
  CaretDown,
} from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const navigation = [
  { name: 'Dashboard', href: '/', icon: House },
  { name: 'Punch Issues', href: '/issues', icon: WarningCircle },
  { name: 'Schedule Violations', href: '/schedule', icon: CalendarX },
  { name: 'Overtime', href: '/overtime', icon: Timer },
  { name: 'Trends', href: '/trends', icon: TrendUp },
  { name: 'Employee Ranking', href: '/ranking', icon: Trophy },
  { name: 'Costs by Dealer', href: '/costs', icon: CurrencyDollar },
]

export function Sidebar() {
  const pathname = usePathname()
  const { collapsed, setCollapsed } = useSidebar()

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar"
      >
        <div className="flex h-full flex-col">
          {/* Header with Logo and Collapse Button */}
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-3">
            <AnimatePresence mode="wait">
              {!collapsed ? (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sidebar-foreground font-bold text-sm shadow-sm">
                    AW
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-sidebar-foreground text-sm tracking-tight">
                      AUTO WAX
                    </span>
                    <span className="text-[11px] text-sidebar-foreground/70">
                      Time Tracking
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
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sidebar-foreground font-bold text-sm shadow-sm mx-auto"
                >
                  AW
                </motion.div>
              )}
            </AnimatePresence>

            {/* Collapse Button - Top Right */}
            {!collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCollapsed(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground transition-colors"
                  >
                    <CaretLeft size={18} weight="bold" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse menu</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Expand Button when collapsed */}
          {collapsed && (
            <div className="flex justify-center py-2 border-b border-sidebar-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCollapsed(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground transition-colors"
                  >
                    <CaretRight size={18} weight="bold" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand menu</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon

                const linkContent = (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-white/15 text-sidebar-foreground shadow-sm'
                        : 'text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground',
                      collapsed && 'justify-center px-0'
                    )}
                  >
                    <Icon
                      size={22}
                      weight={isActive ? 'fill' : 'regular'}
                      className={cn(
                        'shrink-0 transition-transform duration-150',
                        !isActive && 'group-hover:scale-110'
                      )}
                    />
                    <AnimatePresence>
                      {!collapsed && (
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

                if (collapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return linkContent
              })}
            </div>
          </nav>

          {/* User Profile Section */}
          <div className="border-t border-sidebar-border p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground transition-colors',
                    collapsed && 'justify-center px-0'
                  )}
                >
                  <Avatar className="h-8 w-8 border border-white/20">
                    <AvatarImage src="/avatars/user.jpg" alt="User" />
                    <AvatarFallback className="bg-white/15 text-sidebar-foreground text-xs font-semibold">
                      JD
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <>
                      <div className="flex flex-col items-start flex-1 min-w-0">
                        <span className="text-sidebar-foreground font-medium text-sm truncate w-full">
                          John Doe
                        </span>
                        <span className="text-sidebar-foreground/60 text-xs truncate w-full">
                          Administrator
                        </span>
                      </div>
                      <CaretDown
                        size={16}
                        weight="bold"
                        className="text-sidebar-foreground/50"
                      />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={collapsed ? 'right' : 'top'}
                align={collapsed ? 'start' : 'center'}
                className="w-56"
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">John Doe</p>
                  <p className="text-xs text-muted-foreground">john@autowax.com</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 cursor-pointer">
                  <User size={16} weight="regular" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer">
                  <Gear size={16} weight="regular" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                  <SignOut size={16} weight="regular" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.aside>
    </TooltipProvider>
  )
}
