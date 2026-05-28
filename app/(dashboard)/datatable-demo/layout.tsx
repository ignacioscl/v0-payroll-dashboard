'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Pin, Sparkles, Filter as FilterIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  {
    href: '/datatable-demo',
    label: 'Basic',
    icon: Sparkles,
    description: 'Pagination, sort, search, export, column visibility.',
  },
  {
    href: '/datatable-demo/fixed-columns',
    label: 'Fixed columns',
    icon: Pin,
    description: 'Pin columns to the left or right edges.',
  },
  {
    href: '/datatable-demo/filters',
    label: 'Column filters',
    icon: FilterIcon,
    description: 'Text / number / date filters with operators, sent to the backend.',
  },
] as const

export default function DataTableDemoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Data Table</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable component at <code className="rounded bg-muted px-1 text-xs">@/components/shared/data-table</code>{' '}
          wired to the PHP mock at{' '}
          <code className="rounded bg-muted px-1 text-xs">/api/srs/php/api/payroll/datatable-mock.php</code>.
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-1 min-w-[180px] items-start gap-2 rounded-md px-3 py-2 transition-colors',
                active
                  ? 'bg-[#1565C0] text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{tab.label}</span>
                <span
                  className={cn(
                    'text-[11px] leading-tight',
                    active ? 'text-white/80' : 'text-muted-foreground',
                  )}
                >
                  {tab.description}
                </span>
              </div>
            </Link>
          )
        })}
      </nav>

      {children}
    </div>
  )
}
