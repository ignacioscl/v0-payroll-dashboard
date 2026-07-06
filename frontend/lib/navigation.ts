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
  Target,
  Table as TableIcon,
  Wallet,
  ReceiptText,
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
      { nameKey: 'nav.productionVsGoal', href: '/reports/production-vs-goal', icon: Target },
    ],
  },
  {
    nameKey: 'nav.billing',
    href: '/billing/invoices',
    icon: Wallet,
    children: [{ nameKey: 'nav.invoices', href: '/billing/invoices', icon: ReceiptText }],
  },
  { nameKey: 'nav.components', href: '/components', icon: Blocks },
  { nameKey: 'nav.dataTable', href: '/datatable-demo', icon: TableIcon },
]

export const PROD_NAV_HREFS = ['/', '/issues'] as const

/** Real KPI report routes in production (Admin General/Company or production report perm; not /kpis mock). */
export const PROD_KPI_HREFS = ['/reports/business-kpis', '/reports/production-vs-goal'] as const

/** Billing routes gated by ROL_ACCION Invoices module access (15) or system admin. */
export const BILLING_NAV_HREFS = ['/billing/invoices'] as const

export function isDevEnvironment() {
  return process.env.NODE_ENV === 'development'
}

export function isProdAllowedPath(
  pathname: string,
  canAccessProdKpis = false,
  canAccessBillingInvoices = false,
) {
  if (pathname === '/' || pathname === '/issues') return true
  const matches = (hrefs: readonly string[]) =>
    hrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`))
  if (canAccessProdKpis && matches(PROD_KPI_HREFS)) return true
  if (canAccessBillingInvoices && matches(BILLING_NAV_HREFS)) return true
  return false
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
  canAccessBillingInvoices?: boolean
  t: (key: MessageKey) => string
}): NavItem[] {
  const {
    isDev,
    canAccessTtk,
    canAccessProdKpis = false,
    canAccessBillingInvoices = false,
    t,
  } = options

  if (isDev) {
    return ALL_NAVIGATION.map((item) => localizeNavItem(item, t))
  }

  if (!canAccessTtk && !canAccessBillingInvoices) return []

  const allowedHrefs: readonly string[] = [
    ...(canAccessTtk ? PROD_NAV_HREFS : []),
    ...(canAccessProdKpis ? PROD_KPI_HREFS : []),
    ...(canAccessBillingInvoices ? BILLING_NAV_HREFS : []),
  ]

  return ALL_NAVIGATION.filter(
    (item) =>
      allowedHrefs.includes(item.href) ||
      (item.children?.some((child) => allowedHrefs.includes(child.href)) ?? false),
  )
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
