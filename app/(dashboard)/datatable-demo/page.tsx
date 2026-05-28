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
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'id', desc: false }])
  const [globalFilter, setGlobalFilter] = React.useState('')

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
              <div className="truncate font-medium text-foreground">{row.original.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
        meta: { label: 'Employee', sortKey: 'name' } satisfies DataTableColumnMeta<MockEmployee>,
      },
      {
        accessorKey: 'department',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
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
          exportValue: (row) => statusMeta[row.status].label,
        } satisfies DataTableColumnMeta<MockEmployee>,
      },
    ],
    [],
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
        globalFilterPlaceholder="Search name, email, department…"
      />

      <DemoExplainer
        title="The basic table"
        description="Server-side pagination, sort and global search. Column visibility & page size are persisted per `tableId` in localStorage."
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
