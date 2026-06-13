import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  AlertCircle,
  CalendarX,
  Timer,
  TrendingUp,
  Trophy,
  DollarSign,
  FileSpreadsheet,
  Gauge,
  Blocks,
  Table as TableIcon,
} from 'lucide-react'

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  /** Optional nested items rendered as a submenu under the parent. */
  children?: NavItem[]
}

export const ALL_NAVIGATION: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Punch Report', href: '/issues', icon: AlertCircle },
  { name: 'Schedule Violations', href: '/schedule', icon: CalendarX },
  { name: 'Overtime', href: '/overtime', icon: Timer },
  { name: 'Trends', href: '/trends', icon: TrendingUp },
  { name: 'Employee Ranking', href: '/ranking', icon: Trophy },
  { name: 'Costs by Dealer', href: '/costs', icon: DollarSign },
  // In prod: hidden for most users; Admin General may access /kpis/* (see PROD_KPI_HREFS).
  {
    name: 'Business KPIs',
    href: '/kpis',
    icon: Gauge,
    children: [
      { name: 'Payroll Report', href: '/kpis/payroll-report', icon: FileSpreadsheet },
    ],
  },
  { name: 'Components', href: '/components', icon: Blocks },
  { name: 'Data Table', href: '/datatable-demo', icon: TableIcon },
]

export const PROD_NAV_HREFS = ['/', '/issues'] as const

/** KPI routes allowed in production for Admin General only. */
export const PROD_KPI_HREFS = ['/kpis', '/kpis/payroll-report'] as const

export function isDevEnvironment() {
  return process.env.NODE_ENV === 'development'
}

export function isProdAllowedPath(pathname: string, canAccessProdKpis = false) {
  if (pathname === '/' || pathname === '/issues') return true
  if (!canAccessProdKpis) return false
  return pathname === '/kpis' || pathname.startsWith('/kpis/')
}

export function getVisibleNavigation(options: {
  isDev: boolean
  canAccessTtk: boolean
  canAccessProdKpis?: boolean
}): NavItem[] {
  const { isDev, canAccessTtk, canAccessProdKpis = false } = options
  if (isDev) return ALL_NAVIGATION
  if (!canAccessTtk) return []
  const allowedHrefs: readonly string[] = canAccessProdKpis
    ? [...PROD_NAV_HREFS, ...PROD_KPI_HREFS]
    : PROD_NAV_HREFS
  return ALL_NAVIGATION.filter((item) => allowedHrefs.includes(item.href)).map((item) =>
    item.children
      ? {
          ...item,
          children: item.children.filter((child) => allowedHrefs.includes(child.href)),
        }
      : item,
  )
}
