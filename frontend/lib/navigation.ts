import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  AlertCircle,
  CalendarX,
  Timer,
  TrendingUp,
  Trophy,
  DollarSign,
  Gauge,
  Blocks,
  FileBarChart,
  Table as TableIcon,
} from 'lucide-react'
import type { MessageKey } from '@/lib/i18n/messages'

export interface NavItemDef {
  nameKey: MessageKey
  href: string
  icon: LucideIcon
  children?: NavItemDef[]
}

export interface NavItem extends NavItemDef {
  name: string
  children?: NavItem[]
}

export const ALL_NAVIGATION: NavItemDef[] = [
  { nameKey: 'nav.dashboard', href: '/', icon: LayoutDashboard },
  { nameKey: 'nav.punchReport', href: '/issues', icon: AlertCircle },
  { nameKey: 'nav.scheduleViolations', href: '/schedule', icon: CalendarX },
  { nameKey: 'nav.overtime', href: '/overtime', icon: Timer },
  { nameKey: 'nav.trends', href: '/trends', icon: TrendingUp },
  { nameKey: 'nav.employeeRanking', href: '/ranking', icon: Trophy },
  { nameKey: 'nav.costsByDealer', href: '/costs', icon: DollarSign },
  { nameKey: 'nav.businessKpis', href: '/kpis', icon: Gauge },
  {
    nameKey: 'nav.reports',
    href: '/reports/business-kpis',
    icon: FileBarChart,
    children: [
      { nameKey: 'nav.businessKpis', href: '/reports/business-kpis', icon: Gauge },
    ],
  },
  { nameKey: 'nav.components', href: '/components', icon: Blocks },
  { nameKey: 'nav.dataTable', href: '/datatable-demo', icon: TableIcon },
]

export const PROD_NAV_HREFS = ['/', '/issues'] as const

/** KPI routes allowed in production for Admin General only. */
export const PROD_KPI_HREFS = ['/kpis'] as const

export function isDevEnvironment() {
  return process.env.NODE_ENV === 'development'
}

export function isProdAllowedPath(pathname: string, canAccessProdKpis = false) {
  if (pathname === '/' || pathname === '/issues') return true
  if (!canAccessProdKpis) return false
  return pathname === '/kpis'
}

function localizeNavItem(item: NavItemDef, t: (key: MessageKey) => string): NavItem {
  return {
    ...item,
    name: t(item.nameKey),
    children: item.children?.map((child) => localizeNavItem(child, t)),
  }
}

export function getVisibleNavigation(options: {
  isDev: boolean
  canAccessTtk: boolean
  canAccessProdKpis?: boolean
  t: (key: MessageKey) => string
}): NavItem[] {
  const { isDev, canAccessTtk, canAccessProdKpis = false, t } = options

  if (isDev) {
    return ALL_NAVIGATION.map((item) => localizeNavItem(item, t))
  }

  if (!canAccessTtk) return []

  const allowedHrefs: readonly string[] = canAccessProdKpis
    ? [...PROD_NAV_HREFS, ...PROD_KPI_HREFS]
    : PROD_NAV_HREFS

  return ALL_NAVIGATION.filter((item) => allowedHrefs.includes(item.href))
    .map((item) =>
      item.children
        ? {
            ...item,
            children: item.children.filter((child) => allowedHrefs.includes(child.href)),
          }
        : item,
    )
    .map((item) => localizeNavItem(item, t))
}
