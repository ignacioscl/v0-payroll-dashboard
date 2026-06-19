'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Pin, Sparkles, Filter as FilterIcon } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

export default function DataTableDemoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t } = useTranslation()

  const tabs = [
    {
      href: '/datatable-demo',
      label: t('dataTableDemo.tabBasic'),
      icon: Sparkles,
      description: t('dataTableDemo.tabBasicDesc'),
    },
    {
      href: '/datatable-demo/fixed-columns',
      label: t('dataTableDemo.tabFixedColumns'),
      icon: Pin,
      description: t('dataTableDemo.tabFixedColumnsDesc'),
    },
    {
      href: '/datatable-demo/filters',
      label: t('dataTableDemo.tabFilters'),
      icon: FilterIcon,
      description: t('dataTableDemo.tabFiltersDesc'),
    },
  ] as const

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('dataTableDemo.layoutTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('dataTableDemo.layoutSubtitle')}</p>
      </div>

      <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        {tabs.map((tab) => {
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
