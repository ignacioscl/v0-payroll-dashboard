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
  Shield,
  Layers,
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
  {
    nameKey: 'nav.rolesAdmin',
    href: '/roles',
    icon: Shield,
    children: [
      { nameKey: 'nav.rolesList', href: '/roles', icon: Shield },
      { nameKey: 'nav.roleTemplates', href: '/roles/templates', icon: Layers },
    ],
  },
  { nameKey: 'nav.components', href: '/components', icon: Blocks },
  { nameKey: 'nav.dataTable', href: '/datatable-demo', icon: TableIcon },
]

export const PROD_NAV_HREFS = ['/', '/issues'] as const

/** Externals (isCompanyTypeCompany): Punch Report only — no Dashboard home. */
export const PROD_NAV_HREFS_EXTERNAL = ['/issues'] as const

/** Real KPI report routes in production (Admin General/Company or production report perm; not /kpis mock). */
export const PROD_KPI_HREFS = ['/reports/business-kpis', '/reports/production-vs-goal'] as const

/** Billing routes gated by ROL_ACCION Invoices module access (15) or system admin. */
export const BILLING_NAV_HREFS = ['/billing/invoices'] as const

/** Roles Admin — gated by ROL_ACCION 42 (list/view). Includes the Role Templates sub-route. */
export const ROLES_NAV_HREFS = ['/roles', '/roles/templates'] as const

/** Role Templates — 144, Admin Company, or Admin General (`canManageRoleTemplates`). */
const ROLE_TEMPLATES_NAV_HREFS = ['/roles/templates'] as const

/** System settings — gated by ROL_ACCION 141 or system admin (`canAccessSystemConfig`). */
export const SETTINGS_NAV_HREFS = ['/settings'] as const

export function isDevEnvironment() {
  return process.env.NODE_ENV === 'development'
}

export function isProdAllowedPath(
  pathname: string,
  canAccessProdKpis = false,
  canAccessBillingInvoices = false,
  isCompanyTypeCompany = false,
  canViewRoles = false,
  canManageRoleTemplates = false,
  canAccessSystemConfig = false,
) {
  if (pathname === '/') return !isCompanyTypeCompany
  if (pathname === '/issues') return true
  const matches = (hrefs: readonly string[]) =>
    hrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`))
  if (canAccessProdKpis && matches(PROD_KPI_HREFS)) return true
  if (canAccessBillingInvoices && matches(BILLING_NAV_HREFS)) return true
  if (canManageRoleTemplates && matches(ROLE_TEMPLATES_NAV_HREFS)) return true
  if (canAccessSystemConfig && matches(SETTINGS_NAV_HREFS)) return true
  if (canViewRoles && (pathname === '/roles' || pathname.startsWith('/roles/'))) {
    // Templates requires 144 — do not open via 42 alone.
    if (pathname === '/roles/templates' || pathname.startsWith('/roles/templates/')) {
      return false
    }
    return true
  }
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
  canViewRoles?: boolean
  /** Shows the Role Templates child item, independent of `canViewRoles`. */
  canManageRoleTemplates?: boolean
  /** External dealer company (type === 1): hide Dashboard nav item. */
  isCompanyTypeCompany?: boolean
  t: (key: MessageKey) => string
}): NavItem[] {
  const {
    isDev,
    canAccessTtk,
    canAccessProdKpis = false,
    canAccessBillingInvoices = false,
    canViewRoles = false,
    canManageRoleTemplates = false,
    isCompanyTypeCompany = false,
    t,
  } = options

  const withoutDashboard = (items: NavItem[]): NavItem[] =>
    isCompanyTypeCompany ? items.filter((item) => item.href !== '/') : items

  if (isDev) {
    return withoutDashboard(ALL_NAVIGATION.map((item) => localizeNavItem(item, t)))
  }

  if (!canAccessTtk && !canAccessBillingInvoices && !canViewRoles && !canManageRoleTemplates) {
    return []
  }

  const ttkHrefs = isCompanyTypeCompany ? PROD_NAV_HREFS_EXTERNAL : PROD_NAV_HREFS
  const allowedHrefs: readonly string[] = [
    ...(canAccessTtk ? ttkHrefs : []),
    ...(canAccessProdKpis ? PROD_KPI_HREFS : []),
    ...(canAccessBillingInvoices ? BILLING_NAV_HREFS : []),
    ...(canViewRoles ? ['/roles'] : []),
    ...(canManageRoleTemplates ? ROLE_TEMPLATES_NAV_HREFS : []),
  ]

  return withoutDashboard(
    ALL_NAVIGATION.filter(
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
      .map((item) => localizeNavItem(item, t)),
  )
}
