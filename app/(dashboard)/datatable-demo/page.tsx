'use client'

import * as React from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Briefcase,
  CircleCheck,
  CircleDashed,
  CircleX,
} from 'lucide-react'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
  type PaginatedDataTableResponse,
} from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { srsProxyUrl } from '@/lib/srs-proxy-url'

/* -------------------------------------------------------------------------- */
/* Domain types                                                                */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

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
  { label: string; cls: string; icon: React.ReactNode }
> = {
  active: {
    label: 'Active',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    icon: <CircleCheck className="size-3" />,
  },
  on_leave: {
    label: 'On leave',
    cls: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    icon: <CircleDashed className="size-3" />,
  },
  terminated: {
    label: 'Terminated',
    cls: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    icon: <CircleX className="size-3" />,
  },
}

function initials(name: string) {
  return name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
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

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function DataTableDemoPage() {
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<{ id: string; desc: boolean }[]>([
    { id: 'id', desc: false },
  ])
  const [globalFilter, setGlobalFilter] = React.useState('')

  const sortColumn = sorting[0]?.id ?? 'id'
  const sortDir = sorting[0]?.desc ? 'desc' : 'asc'

  const query = useQuery({
    queryKey: ['datatable-mock', pageIndex, pageSize, sortColumn, sortDir, globalFilter],
    queryFn: async () => {
      const url = srsProxyUrl('php/api/payroll/datatable-mock.php', {
        page: pageIndex + 1,
        page_size: pageSize,
        sort: sortColumn,
        dir: sortDir,
        term: globalFilter,
      })
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Mock fetch failed: ${res.status}`)
      const json = (await res.json()) as MockResponse
      return json.data
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })

  const columns = React.useMemo<ColumnDef<MockEmployee>[]>(
    () => [
      {
        accessorKey: 'id',
        header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
        cell: ({ row }) => `#${row.original.id}`,
        meta: {
          label: 'ID',
          headerClassName: 'w-[68px]',
          mono: true,
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
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
              <div className="truncate font-medium text-foreground">
                {row.original.name}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {row.original.email}
              </div>
            </div>
          </div>
        ),
        meta: { label: 'Employee' } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'department',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Department" />
        ),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            <Briefcase className="size-2.5 text-muted-foreground" />
            {row.original.department}
          </span>
        ),
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
        cell: ({ row }) => usdFmt.format(row.original.salary),
        meta: {
          label: 'Salary',
          numeric: true,
          mono: true,
          exportValue: (row) => row.salary,
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'hire_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Hire date" />,
        cell: ({ row }) => dateFmt.format(new Date(row.original.hire_date)),
        meta: { label: 'Hire date', mono: true } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const meta = statusMeta[row.original.status]
          return (
            <Badge
              variant="outline"
              className={`gap-1 border-0 px-1.5 py-0.5 text-[10px] font-medium ring-1 ${meta.cls}`}
            >
              {meta.icon}
              {meta.label}
            </Badge>
          )
        },
        meta: {
          label: 'Status',
          exportValue: (row) => statusMeta[row.status].label,
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Data Table</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable table powered by{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">@tanstack/react-table</code>{' '}
          with server-side pagination, sorting, column visibility and export.
          Hits the mock at{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            /api/srs/php/api/payroll/datatable-mock.php
          </code>
          .
        </p>
      </div>

      <DataTable<MockEmployee>
        tableId="demo-employees"
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
        globalFilterPlaceholder="Search name, email, department…"
      />
    </div>
  )
}
