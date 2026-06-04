'use client'

import * as React from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { CircleCheck, CircleDashed, CircleX, Pin } from 'lucide-react'
import {
  DataTable,
  DataTableColumnHeader,
  buildBackendQuery,
  type DataTableColumnMeta,
  type PaginatedDataTableResponse,
} from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { srsProxyUrl } from '@/lib/srs-proxy-url'
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

const statusMeta: Record<MockEmployee['status'], { label: string; cls: string; icon: React.ReactNode }> = {
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: <CircleCheck className="size-3" /> },
  on_leave: { label: 'On leave', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: <CircleDashed className="size-3" /> },
  terminated: { label: 'Terminated', cls: 'bg-rose-50 text-rose-700 ring-rose-600/20', icon: <CircleX className="size-3" /> },
}

/** Synthetic extra columns to make the table wide enough that scroll-pinning shines. */
function quarterSalary(base: number, multiplier: number): number {
  return Math.round((base * multiplier) / 4)
}

export default function DataTableFixedColumnsPage() {
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'id', desc: false }])

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
        size: 80, // explicit — required for pinned columns so sticky offsets are accurate
        header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
        cell: ({ row }) => `#${row.original.id}`,
        meta: {
          label: 'ID',
          mono: true,
          pin: 'left',
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'name',
        size: 240, // explicit — required for pinned columns
        header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-[9px] font-semibold text-white shadow-sm">
              {row.original.name
                .split(' ')
                .map((s) => s[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
        meta: {
          label: 'Employee',
          pin: 'left',
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'department',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
        cell: ({ row }) => row.original.department,
        meta: { label: 'Department' } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'position',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Position" />,
        cell: ({ row }) => row.original.position,
        meta: { label: 'Position' } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'salary',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Salary" />,
        cell: ({ row }) => usd.format(row.original.salary),
        meta: {
          label: 'Salary',
          numeric: true,
          mono: true,
          exportValue: (row) => row.salary,
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      // ---- Synthetic per-quarter columns to widen the table ----
      ...(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q, i) => ({
        id: `bonus_${q.toLowerCase()}`,
        accessorFn: (row: MockEmployee) => quarterSalary(row.salary, 0.04 + i * 0.01),
        header: ({ column }: { column: ReturnType<typeof Object> }) => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <DataTableColumnHeader column={column as any} title={`${q} bonus`} />
        ),
        cell: ({ getValue }: { getValue: () => unknown }) => usd.format(Number(getValue())),
        meta: {
          label: `${q} bonus`,
          numeric: true,
          mono: true,
        } satisfies DataTableColumnMeta<MockEmployee>,
      })) as ColumnDef<MockEmployee>[],
      {
        accessorKey: 'hire_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Hire date" />,
        cell: ({ row }) =>
          new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }).format(new Date(row.original.hire_date)),
        meta: { label: 'Hire date', mono: true } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
        cell: ({ row }) => row.original.email,
        meta: { label: 'Email' } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const m = statusMeta[row.original.status]
          return (
            <Badge
              variant="outline"
              className={`gap-1 border-0 px-1.5 py-0.5 text-[10px] font-medium ring-1 ${m.cls}`}
            >
              {m.icon}
              {m.label}
            </Badge>
          )
        },
        meta: {
          label: 'Status',
          pin: 'right',
          headerClassName: 'min-w-[120px]',
          exportValue: (row) => statusMeta[row.status].label,
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
    ],
    [],
  )

  const query = useQuery({
    queryKey: ['datatable-mock', 'pinned', pageIndex, pageSize, sorting],
    queryFn: async () => {
      const params = buildBackendQuery({
        columns,
        sorting,
        columnFilters: [],
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
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Pin className="size-3 rotate-45 text-blue-600" />
          Scroll horizontally — <span className="font-semibold text-foreground">ID</span> and{' '}
          <span className="font-semibold text-foreground">Employee</span> stay pinned on the left,{' '}
          <span className="font-semibold text-foreground">Status</span> stays pinned on the right.
          Drag the right edge of any column header to resize it.
        </p>
        <DataTable<MockEmployee>
          tableId="demo-pinned"
          columns={columns}
          data={query.data?.results ?? []}
          isLoading={query.isFetching}
          exportFileName="employees-pinned"
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
          enableGlobalFilter={false}
          enableTableFocus
          tableScrollHeight={computedScrollHeight}
        />
      </div>

      <DemoExplainer
        title="Pin columns to the edges"
        description={
          <>
            Add <code className="rounded bg-muted px-1 text-[10px]">pin: 'left' | 'right'</code> to the
            column's <code className="rounded bg-muted px-1 text-[10px]">meta</code>. The cell becomes{' '}
            <code className="rounded bg-muted px-1 text-[10px]">position: sticky</code> and gets a soft
            shadow on the inner edge to separate it from the scrolling content.
          </>
        }
        steps={[
          {
            title: 'Pin a column to the left',
            badge: 'meta.pin',
            code: `{
  accessorKey: 'name',
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Employee" />
  ),
  meta: {
    label: 'Employee',
    pin: 'left',                  // 👈 sticky on the left edge
    headerClassName: 'min-w-[220px]',
  },
}`,
            note: 'Multiple columns can be pinned left — they stack in declaration order.',
          },
          {
            title: 'Pin a column to the right',
            badge: 'meta.pin',
            code: `{
  accessorKey: 'status',
  meta: {
    label: 'Status',
    pin: 'right',                 // 👈 sticky on the right edge
  },
}`,
          },
          {
            title: 'Override at runtime',
            badge: 'optional',
            code: `<DataTable
  columnPinning={{
    left: ['id', 'name'],
    right: ['status'],
  }}
  ...
/>`,
            note: 'Useful when pinning depends on user preferences or roles. Otherwise pinning is derived from each column\'s meta.',
          },
        ]}
      />
    </div>
  )
}
