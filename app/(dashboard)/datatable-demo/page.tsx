'use client'

import * as React from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  Briefcase,
  CircleCheck,
  CircleDashed,
  CircleX,
} from 'lucide-react'
import {
  DataTable,
  DataTableColumnHeader,
  buildBackendQuery,
  type DataTableColumnMeta,
  type PaginatedDataTableResponse,
} from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { srsProxyUrl } from '@/lib/srs-proxy-url'
import { useTranslation } from '@/lib/i18n/locale-context'
import { DemoExplainer } from './_components/demo-explainer'

interface MockEmployee {
  id: number
  name: string
  email: string
  department: string
  position: string
  salary: number
  hire_date: string
  status: 'active' | 'on_leave' | 'terminated'
}

interface MockResponse {
  status: string
  data: PaginatedDataTableResponse<MockEmployee>
}

const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const statusMeta: Record<
  MockEmployee['status'],
  { labelKey: 'statusActive' | 'statusOnLeave' | 'statusTerminated'; cls: string; icon: React.ReactNode }
> = {
  active: {
    labelKey: 'statusActive',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    icon: <CircleCheck className="size-3" />,
  },
  on_leave: {
    labelKey: 'statusOnLeave',
    cls: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    icon: <CircleDashed className="size-3" />,
  },
  terminated: {
    labelKey: 'statusTerminated',
    cls: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    icon: <CircleX className="size-3" />,
  },
}

function initials(name: string) {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
}

function avatarTone(id: number) {
  const tones = [
    'from-blue-500 to-indigo-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-fuchsia-500 to-pink-500',
    'from-cyan-500 to-sky-500',
    'from-violet-500 to-purple-500',
  ]
  return tones[id % tones.length]!
}

export default function DataTableBasicPage() {
  const { t } = useTranslation()
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'id', desc: false }])
  const [globalFilter, setGlobalFilter] = React.useState('')

  const [computedScrollHeight, setComputedScrollHeight] = React.useState<string | undefined>(undefined)
  React.useLayoutEffect(() => {
    const NAV_H = 64
    const TOOLBAR_H = 40
    const PAGINATION_H = 52
    const BOTTOM_PAD = 24
    const compute = () => {
      const h = window.innerHeight - NAV_H - TOOLBAR_H - PAGINATION_H - BOTTOM_PAD
      setComputedScrollHeight(h > 200 ? `${h}px` : undefined)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  const columns = React.useMemo<ColumnDef<MockEmployee>[]>(
    () => [
      {
        accessorKey: 'id',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colId')} />,
        cell: ({ row }) => `#${row.original.id}`,
        meta: {
          label: t('dataTableDemo.colId'),
          headerClassName: 'w-[68px]',
          mono: true,
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colEmployee')} />,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-semibold text-white shadow-sm ring-1 ring-black/5 ${avatarTone(
                row.original.id,
              )}`}
            >
              {initials(row.original.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{row.original.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
        meta: { label: t('dataTableDemo.colEmployee'), sortKey: 'name' } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'department',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colDepartment')} />,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            <Briefcase className="size-2.5 text-muted-foreground" />
            {row.original.department}
          </span>
        ),
        meta: { label: t('dataTableDemo.colDepartment') } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'position',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colPosition')} />,
        cell: ({ row }) => row.original.position,
        meta: { label: t('dataTableDemo.colPosition') } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'salary',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colSalary')} />,
        cell: ({ row }) => usdFmt.format(row.original.salary),
        meta: {
          label: t('dataTableDemo.colSalary'),
          numeric: true,
          mono: true,
          exportValue: (row) => row.salary,
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'hire_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colHireDate')} />,
        cell: ({ row }) => dateFmt.format(new Date(row.original.hire_date)),
        meta: { label: t('dataTableDemo.colHireDate'), mono: true } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colStatus')} />,
        cell: ({ row }) => {
          const m = statusMeta[row.original.status]
          return (
            <Badge
              variant="outline"
              className={`gap-1 border-0 px-1.5 py-0.5 text-[10px] font-medium ring-1 ${m.cls}`}
            >
              {m.icon}
              {t(`dataTableDemo.${m.labelKey}`)}
            </Badge>
          )
        },
        meta: {
          label: t('dataTableDemo.colStatus'),
          exportValue: (row) => t(`dataTableDemo.${statusMeta[row.status].labelKey}`),
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
    ],
    [t],
  )

  const query = useQuery({
    queryKey: ['datatable-mock', 'basic', pageIndex, pageSize, sorting, globalFilter],
    queryFn: async () => {
      const params = buildBackendQuery({
        columns,
        sorting,
        columnFilters: [],
        page: pageIndex + 1,
        pageSize,
        extra: { term: globalFilter },
      })
      const url = srsProxyUrl('php/api/payroll/datatable-mock.php', params)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Mock fetch failed: ${res.status}`)
      const json = (await res.json()) as MockResponse
      return json.data
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <DataTable<MockEmployee>
        tableId="demo-basic"
        columns={columns}
        data={query.data?.results ?? []}
        isLoading={query.isFetching}
        exportFileName="employees"
        pagination={{
          pageIndex,
          pageSize,
          pageCount: query.data
            ? Math.max(1, Math.ceil((query.data.total ?? 0) / pageSize))
            : -1,
          totalRows: query.data?.total,
          onPaginationChange: (next) => {
            setPageIndex(next.pageIndex)
            setPageSize(next.pageSize)
          },
        }}
        manualSorting
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next)
          setPageIndex(0)
        }}
        manualFiltering
        globalFilter={globalFilter}
        onGlobalFilterChange={(v) => {
          setGlobalFilter(v)
          setPageIndex(0)
        }}
        globalFilterPlaceholder={t('dataTableDemo.searchPlaceholder')}
        enableTableFocus
        tableScrollHeight={computedScrollHeight}
      />

      <DemoExplainer
        howConfiguredLabel={t('dataTableDemo.howConfigured')}
        title={t('dataTableDemo.basicTitle')}
        description={t('dataTableDemo.basicDescription')}
        steps={[
          {
            title: 'Declare columns',
            badge: 'meta',
            code: `{
  accessorKey: 'salary',
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Salary" />
  ),
  cell: ({ row }) => usdFmt.format(row.original.salary),
  meta: {
    label: 'Salary',
    numeric: true,   // right-align + tabular-nums
    mono: true,      // font-mono
  },
}`,
          },
          {
            title: 'Build the backend query',
            badge: 'helper',
            code: `const params = buildBackendQuery({
  columns,
  sorting,
  columnFilters: [],
  page: pageIndex + 1,
  pageSize,
  extra: { term: globalFilter },
})

fetch(srsProxyUrl(endpoint, params))`,
            note: 'Helper builds `page`, `page_size`, `sort`, `dir` plus any column filters using each column\'s `meta.filter.backendKey`.',
          },
          {
            title: 'Mount the table',
            badge: 'server-side',
            code: `<DataTable
  tableId="demo-basic"
  columns={columns}
  data={query.data?.results ?? []}
  isLoading={query.isFetching}
  pagination={{ ... }}
  manualSorting
  sorting={sorting}
  onSortingChange={setSorting}
  manualFiltering
  globalFilter={term}
  onGlobalFilterChange={setTerm}
/>`,
          },
        ]}
      />
    </div>
  )
}
