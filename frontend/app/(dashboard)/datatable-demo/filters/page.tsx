'use client'

import * as React from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from '@tanstack/react-table'
import { CircleCheck, CircleDashed, CircleX } from 'lucide-react'
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
import { DemoExplainer } from '../_components/demo-explainer'

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

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const statusMeta: Record<MockEmployee['status'], { labelKey: 'statusActive' | 'statusOnLeave' | 'statusTerminated'; cls: string; icon: React.ReactNode }> = {
  active: { labelKey: 'statusActive', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: <CircleCheck className="size-3" /> },
  on_leave: { labelKey: 'statusOnLeave', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: <CircleDashed className="size-3" /> },
  terminated: { labelKey: 'statusTerminated', cls: 'bg-rose-50 text-rose-700 ring-rose-600/20', icon: <CircleX className="size-3" /> },
}

export default function DataTableFiltersPage() {
  const { t } = useTranslation()
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'id', desc: false }])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

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
          mono: true,
          headerClassName: 'w-[80px]',
          filter: {
            type: 'number',
            backendKey: 'id',
            placeholder: 'Employee #',
            defaultOperator: 'eq',
          },
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colName')} />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        meta: {
          label: t('dataTableDemo.colName'),
          sortKey: 'name',
          filter: {
            type: 'text',
            backendKey: 'name',
            placeholder: 'Search by name…',
            defaultOperator: 'contains',
          },
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colEmail')} />,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
        meta: {
          label: t('dataTableDemo.colEmail'),
          filter: {
            type: 'text',
            backendKey: 'email',
            placeholder: 'john@example.com',
            defaultOperator: 'ends_with',
          },
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'department',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colDepartment')} />,
        cell: ({ row }) => row.original.department,
        meta: {
          label: t('dataTableDemo.colDepartment'),
          filter: {
            type: 'text',
            backendKey: 'department',
            placeholder: 'Engineering',
            defaultOperator: 'equals',
          },
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'salary',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colSalary')} />,
        cell: ({ row }) => usd.format(row.original.salary),
        meta: {
          label: t('dataTableDemo.colSalary'),
          numeric: true,
          mono: true,
          exportValue: (row) => row.salary,
          filter: {
            type: 'number',
            backendKey: 'salary',
            placeholder: '90000',
            defaultOperator: 'gte',
          },
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'hire_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dataTableDemo.colHireDate')} />,
        cell: ({ row }) =>
          new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }).format(new Date(row.original.hire_date)),
        meta: {
          label: t('dataTableDemo.colHireDate'),
          mono: true,
          filter: {
            type: 'date',
            backendKey: 'hire_date',
            defaultOperator: 'gte',
          },
        } satisfies DataTableColumnMeta<MockEmployee>,
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
          filter: {
            type: 'text',
            backendKey: 'status',
            placeholder: 'active | on_leave | terminated',
            defaultOperator: 'equals',
          },
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
    ],
    [t],
  )

  const query = useQuery({
    queryKey: ['datatable-mock', 'filters', pageIndex, pageSize, sorting, columnFilters],
    queryFn: async () => {
      const params = buildBackendQuery({
        columns,
        sorting,
        columnFilters,
        page: pageIndex + 1,
        pageSize,
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
      <div className="min-w-0 space-y-2">
        <p className="text-[11px] text-muted-foreground">{t('dataTableDemo.filtersHint')}</p>
        <DataTable<MockEmployee>
          tableId="demo-filters"
          columns={columns}
          data={query.data?.results ?? []}
          isLoading={query.isFetching}
          exportFileName="employees-filtered"
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
          columnFilters={columnFilters}
          onColumnFiltersChange={(next) => {
            setColumnFilters(next)
            setPageIndex(0)
          }}
          enableGlobalFilter={false}
          enableTableFocus
          tableScrollHeight={computedScrollHeight}
        />
      </div>

      <DemoExplainer
        howConfiguredLabel={t('dataTableDemo.howConfigured')}
        title={t('dataTableDemo.filtersTitle')}
        description={t('dataTableDemo.filtersDescription')}
        steps={[
          {
            title: 'Text filter (contains / starts / etc)',
            badge: 'meta.filter.type=text',
            code: `meta: {
  filter: {
    type: 'text',
    backendKey: 'name',          // sent as ?name=...&name_op=...
    defaultOperator: 'contains',
    placeholder: 'Search by name…',
  },
}`,
            note: 'Operators: contains, not_contains, starts_with, ends_with, equals, not_equals.',
          },
          {
            title: 'Number filter ( =, ≤, ≥, … )',
            badge: 'meta.filter.type=number',
            code: `meta: {
  filter: {
    type: 'number',
    backendKey: 'salary',
    defaultOperator: 'gte',
  },
}`,
            note: 'Operators: eq, neq, lt, lte, gt, gte.',
          },
          {
            title: 'Date filter (Calendar picker)',
            badge: 'meta.filter.type=date',
            code: `meta: {
  filter: {
    type: 'date',
    backendKey: 'hire_date',     // sent as ?hire_date=YYYY-MM-DD
    defaultOperator: 'gte',
  },
}`,
            note: 'Operators: eq, lt, lte, gt, gte. Values are ISO `YYYY-MM-DD`.',
          },
          {
            title: 'Override the backend param name',
            badge: 'backendKey',
            code: `meta: {
  filter: {
    type: 'text',
    backendKey: 'employee_name', // 👈 sent as ?employee_name=...
    operatorParamSuffix: '_cmp', // 👈 sent as ?employee_name_cmp=contains
  },
}`,
          },
          {
            title: 'Customize the sort param key',
            badge: 'meta.sortKey',
            code: `meta: {
  label: 'Name',
  sortKey: 'us.nombre',          // 👈 sent as ?sort=us.nombre&dir=asc
}`,
            note: 'Defaults to the column id when omitted.',
          },
          {
            title: 'Wire to the query',
            badge: 'helper',
            code: `const params = buildBackendQuery({
  columns,
  sorting,
  columnFilters,
  page: pageIndex + 1,
  pageSize,
})

fetch(srsProxyUrl(endpoint, params))`,
            note: 'You can also call `buildBackendFilters` / `buildBackendSort` separately if you need finer control.',
          },
        ]}
      />
    </div>
  )
}
