import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  AlertCircle,
  CalendarX,
  Timer,
  TrendingUp,
  Trophy,
  DollarSign,
  Blocks,
  Table as TableIcon,
} from 'lucide-react'

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

export const ALL_NAVIGATION: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Punch Issues', href: '/issues', icon: AlertCircle },
  { name: 'Schedule Violations', href: '/schedule', icon: CalendarX },
  { name: 'Overtime', href: '/overtime', icon: Timer },
  { name: 'Trends', href: '/trends', icon: TrendingUp },
  { name: 'Employee Ranking', href: '/ranking', icon: Trophy },
  { name: 'Costs by Dealer', href: '/costs', icon: DollarSign },
  { name: 'Components', href: '/components', icon: Blocks },
  { name: 'Data Table', href: '/datatable-demo', icon: TableIcon },
]

export const PROD_NAV_HREFS = ['/', '/issues'] as const

export function isDevEnvironment() {
  return process.env.NODE_ENV === 'development'
}

export function isProdAllowedPath(pathname: string) {
  return pathname === '/' || pathname === '/issues'
}

export function getVisibleNavigation(options: {
  isDev: boolean
  canAccessTtk: boolean
}): NavItem[] {
  const { isDev, canAccessTtk } = options
  if (isDev) return ALL_NAVIGATION
  if (!canAccessTtk) return []
  return ALL_NAVIGATION.filter((item) =>
    (PROD_NAV_HREFS as readonly string[]).includes(item.href),
  )
}
