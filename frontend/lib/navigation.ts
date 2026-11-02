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
  Landmark,
  Table as TableIcon,
  Wallet,
  ReceiptText,
  Shield,
  Layers,
  Receipt,
  List,
  PieChart,
  Repeat,
  Settings,
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
      { nameKey: 'nav.incomeByDealer', href: '/reports/income-by-dealer', icon: Landmark },
    ],
  },
  {
    nameKey: 'nav.billing',
    href: '/billing/invoices',
    icon: Wallet,
    children: [{ nameKey: 'nav.invoices', href: '/billing/invoices', icon: ReceiptText }],
  },
  {
    nameKey: 'nav.expenses',
    href: '/expenses',
    icon: Receipt,
    children: [
      { nameKey: 'nav.expensesList', href: '/expenses', icon: List },
      { nameKey: 'nav.expensesAnalytics', href: '/expenses/analytics', icon: PieChart },
      { nameKey: 'nav.expensesRecurring', href: '/expenses/recurring', icon: Repeat },
      { nameKey: 'nav.expensesSettings', href: '/expenses/settings', icon: Settings },
    ],
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

/** Business KPIs: Admin General/Company, Production Report (47) or Time Tracking > Payroll (93). */
export const PROD_KPI_HREFS = ['/reports/business-kpis'] as const

/** Production vs Goal and Income by Dealer: Admin General/Company or Production Report (47) only. */
export const PROD_GOAL_HREFS = ['/reports/production-vs-goal', '/reports/income-by-dealer'] as const

/** Billing routes gated by ROL_ACCION Invoices module access (15) or system admin. */
export const BILLING_NAV_HREFS = ['/billing/invoices'] as const

/** Roles Admin — gated by ROL_ACCION 42 (list/view). Includes the Role Templates sub-route. */
export const ROLES_NAV_HREFS = ['/roles', '/roles/templates'] as const

/** Role Templates — 144, Admin Company, or Admin General (`canManageRoleTemplates`). */
const ROLE_TEMPLATES_NAV_HREFS = ['/roles/templates'] as const

/** System settings — gated by ROL_ACCION 141 or system admin (`canAccessSystemConfig`). */
export const SETTINGS_NAV_HREFS = ['/settings'] as const

/**
 * Expenses — gated by ROL_ACCION 111 or system admin (`canAccessExpenses`). The sub-routes
 * (`/expenses/new`, `/expenses/[id]/edit`, `/expenses/recurring/[id]`) open by prefix.
 */
export const EXPENSES_NAV_HREFS = [
  '/expenses',
  '/expenses/analytics',
  '/expenses/recurring',
  '/expenses/settings',
] as const

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
  canAccessProductionGoal = false,
  canAccessExpenses = false,
) {
  if (pathname === '/') return !isCompanyTypeCompany
  if (pathname === '/issues') return true
  const matches = (hrefs: readonly string[]) =>
    hrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`))
  if (canAccessExpenses && matches(EXPENSES_NAV_HREFS)) return true
  if (canAccessProdKpis && matches(PROD_KPI_HREFS)) return true
  if (canAccessProductionGoal && matches(PROD_GOAL_HREFS)) return true
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
  /** Production vs Goal (Production Report, 47). */
  canAccessProductionGoal?: boolean
  canAccessBillingInvoices?: boolean
  canViewRoles?: boolean
  /** Shows the Role Templates child item, independent of `canViewRoles`. */
  canManageRoleTemplates?: boolean
  /** External dealer company (type === 1): hide Dashboard nav item. */
  isCompanyTypeCompany?: boolean
  /** Expenses group (111 or admin). */
  canAccessExpenses?: boolean
  t: (key: MessageKey) => string
}): NavItem[] {
  const {
    isDev,
    canAccessTtk,
    canAccessProdKpis = false,
    canAccessProductionGoal = false,
    canAccessBillingInvoices = false,
    canViewRoles = false,
    canManageRoleTemplates = false,
    isCompanyTypeCompany = false,
    canAccessExpenses = false,
    t,
  } = options

  const withoutDashboard = (items: NavItem[]): NavItem[] =>
    isCompanyTypeCompany ? items.filter((item) => item.href !== '/') : items

  if (isDev) {
    return withoutDashboard(ALL_NAVIGATION.map((item) => localizeNavItem(item, t)))
  }

  if (
    !canAccessTtk &&
    !canAccessProdKpis &&
    !canAccessBillingInvoices &&
    !canViewRoles &&
    !canManageRoleTemplates &&
    !canAccessExpenses
  ) {
    return []
  }

  const ttkHrefs = isCompanyTypeCompany ? PROD_NAV_HREFS_EXTERNAL : PROD_NAV_HREFS
  const allowedHrefs: readonly string[] = [
    ...(canAccessTtk ? ttkHrefs : []),
    ...(canAccessProdKpis ? PROD_KPI_HREFS : []),
    ...(canAccessProductionGoal ? PROD_GOAL_HREFS : []),
    ...(canAccessBillingInvoices ? BILLING_NAV_HREFS : []),
    ...(canViewRoles ? ['/roles'] : []),
    ...(canManageRoleTemplates ? ROLE_TEMPLATES_NAV_HREFS : []),
    ...(canAccessExpenses ? EXPENSES_NAV_HREFS : []),
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
