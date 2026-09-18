'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Info, X } from 'lucide-react'
import {
  DATA_TABLE_PAGE_SIZE_ALL,
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { DealerRankingExportButton } from '@/components/dashboard/dealer-ranking-export-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n/locale-context'
import { FLAG_TYPE_META, flagEnabledIn } from '@/lib/ttk/error-type-meta'
import {
  DEALER_RANKING_BY_TYPE_KEY,
  type DealerRankingQueryParams,
  type DealerRankingRow,
} from '@/lib/ttk/dealer-ranking-types'

/**
 * Fila de la tabla. La posición se fija ANTES de pasarla: ordenar por otra
 * columna reacomoda las filas, pero cada dealer conserva su puesto en el ranking.
 */
type RankedDealerRow = DealerRankingRow & { rank: number }

/**
 * Ancho de una columna de número. Lo fija el encabezado —en mayúsculas y con el
 * ícono de orden—, no el dato, que tiene dos o tres cifras. Sale del texto ya
 * traducido porque cada idioma tiene su rótulo largo: "Without clock out" en
 * inglés, "Descanso faltante" en español.
 */
function headerFitSize(title: string): number {
  return Math.round(title.length * 8.2) + 52
}

/** El cero va apagado: en una fila de contadores, lo que importa es lo que no es cero. */
function countCell(value: number): React.ReactNode {
  return value > 0 ? value.toLocaleString() : <span className="text-muted-foreground">0</span>
}

export type DealersRankingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Posición del switch del Dashboard: decide título, columnas y qué lista se ve. */
  isCorrected: boolean
  /** La lista entera del estado actual; la tarjeta muestra los primeros 5 de ésta. */
  rows: DealerRankingRow[]
  loading: boolean
  includedErrorTypes: readonly number[]
  /** `Report from … to …`, el mismo texto del Dashboard. */
  periodLabel: string | null
  /** Corrected + período que arranca antes del registro de correcciones. */
  showCoverageNotice: boolean
  /**
   * *Time Tracking > Hours Admin.* (65) decide el Export y las filas clickeables
   * (DP1). Sin él el modal se ve igual, pero no exporta ni navega.
   */
  canAccessPunchReport: boolean
  onDealerClick: (idDealer: number) => void
  /** Los filtros con que se pidió el ranking: el export manda exactamente éstos. */
  exportParams: DealerRankingQueryParams | null
}

/**
 * "View all" de la tarjeta *Dealers with most errors*: el ranking entero, sólo
 * dealers. Las filas salen del mismo pedido que la tarjeta, así que sus primeros
 * 5 coinciden por construcción.
 */
export function DealersRankingDialog({
  open,
  onOpenChange,
  isCorrected,
  rows,
  loading,
  includedErrorTypes,
  periodLabel,
  showCoverageNotice,
  canAccessPunchReport,
  onDealerClick,
  exportParams,
}: DealersRankingDialogProps) {
  const { t } = useTranslation()

  const rankedRows = React.useMemo<RankedDealerRow[]>(
    () => rows.map((row, index) => ({ ...row, rank: index + 1 })),
    [rows],
  )

  /**
   * `enableHiding: false` en TODAS: el encabezado ofrece *Hide column* mientras la
   * columna lo permita, y la visibilidad se guarda por `tableId`. Con el selector
   * de columnas apagado, una columna ocultada no tendría cómo volver, ni en esta
   * apertura ni en la próxima.
   */
  const columns = React.useMemo<ColumnDef<RankedDealerRow>[]>(() => {
    const dealerLabel = t('dashboard.dealersRankingDealer')
    const totalLabel = isCorrected
      ? t('dashboard.dealersRankingCorrections')
      : t('dashboard.dealersRankingErrors')
    const punchesLabel = t('dashboard.dealersRankingPunches')

    const list: ColumnDef<RankedDealerRow>[] = [
      {
        id: 'rank',
        accessorFn: (row) => row.rank,
        size: headerFitSize('#'),
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
        cell: ({ row }) => (
          <span className="font-semibold text-muted-foreground">{row.original.rank}</span>
        ),
        meta: { label: '#', numeric: true } satisfies DataTableColumnMeta<RankedDealerRow>,
      },
      {
        id: 'dealerName',
        accessorFn: (row) => row.dealerName,
        // Absorbe el ancho que sobra (`flexColumnId`); éste es su piso.
        minSize: 160,
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={dealerLabel} />,
        cell: ({ row }) => (
          <span className="block truncate font-medium" title={row.original.dealerName}>
            {row.original.dealerName}
          </span>
        ),
        meta: { label: dealerLabel } satisfies DataTableColumnMeta<RankedDealerRow>,
      },
      {
        id: 'total',
        accessorFn: (row) => row.total,
        size: headerFitSize(totalLabel),
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={totalLabel} />,
        // Mismo acento que la tarjeta: rojo la deuda, verde la actividad.
        cell: ({ row }) => (
          <span
            className={
              isCorrected ? 'font-semibold text-emerald-600' : 'font-semibold text-destructive'
            }
          >
            {row.original.total.toLocaleString()}
          </span>
        ),
        meta: { label: totalLabel, numeric: true } satisfies DataTableColumnMeta<RankedDealerRow>,
      },
    ]

    // Corrections son eventos (el número de la tarjeta); Punches, ponchadas
    // distintas: lo que cuenta Grouped, adonde lleva el click. Sin esta columna
    // el modal no se puede cotejar contra el destino.
    if (isCorrected) {
      list.push({
        id: 'punches',
        accessorFn: (row) => row.punches ?? 0,
        size: headerFitSize(punchesLabel),
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={punchesLabel} />,
        cell: ({ row }) => countCell(row.original.punches ?? 0),
        meta: {
          label: punchesLabel,
          numeric: true,
        } satisfies DataTableColumnMeta<RankedDealerRow>,
      })
    }

    // Una columna por tipo INCLUIDO: los excluidos con las tarjetas de tipo del
    // Dashboard no tienen columna, igual que no suman en la tarjeta.
    for (const typeMeta of FLAG_TYPE_META) {
      if (!includedErrorTypes.includes(typeMeta.code)) continue
      if (!flagEnabledIn(typeMeta, isCorrected ? 'corrected' : 'pending')) continue
      const key = DEALER_RANKING_BY_TYPE_KEY[typeMeta.code]
      const label = t(typeMeta.chartLabelKey)
      list.push({
        id: key,
        accessorFn: (row) => row.byType[key] ?? 0,
        size: headerFitSize(label),
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={label} />,
        cell: ({ row }) => countCell(row.original.byType[key] ?? 0),
        meta: { label, numeric: true } satisfies DataTableColumnMeta<RankedDealerRow>,
      })
    }

    return list
  }, [isCorrected, includedErrorTypes, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Ancho para que las columnas de tipo entren sin scroll horizontal: con los
        encabezados de siempre (mayúsculas + ícono de orden) no caben en un 3xl, y
        *Break missing* —el tipo más frecuente— quedaba tapado.
      */}
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto sm:max-w-[min(96vw,64rem)]">
        <DialogHeader className="pr-8">
          <DialogTitle>
            {isCorrected ? t('dashboard.dealersMostCorrected') : t('dashboard.dealersMostErrors')}
          </DialogTitle>
          <DialogDescription>{periodLabel ?? '…'}</DialogDescription>
        </DialogHeader>

        {/* El mismo aviso del Dashboard: la bitácora de correcciones arrancó sin backfill. */}
        {showCoverageNotice ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{t('punch.correctionsCoverageNotice')}</AlertDescription>
          </Alert>
        ) : null}

        {canAccessPunchReport ? (
          <p className="text-xs text-muted-foreground">{t('dashboard.dealersRankingClickHint')}</p>
        ) : null}

        <DataTable<RankedDealerRow>
          tableId="dashboard-dealers-ranking"
          columns={columns}
          data={rankedRows}
          getRowId={(row) => String(row.idDealer)}
          isLoading={loading}
          emptyState={
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('common.noDataToDisplay')}
            </p>
          }
          // Todas las filas, sin paginar: ya vienen todas del hook. "All" tiene que
          // existir como opción, si no el selector de filas queda en blanco.
          defaultPageSize={DATA_TABLE_PAGE_SIZE_ALL}
          includeAllPageSize
          // Acota el scroll para que funcione el encabezado fijo.
          tableScrollHeight="60vh"
          flexColumnId="dealerName"
          // El export es del servidor (Report Info + Dealers + Employees): va en el pie.
          enableExport={false}
          enableGlobalFilter={false}
          enableViewOptions={false}
          // Sin permiso no se pasa: la fila no navega ni parece clickeable (DP1).
          onRowClick={canAccessPunchReport ? (row) => onDealerClick(row.idDealer) : undefined}
        />

        <DialogFooter>
          {canAccessPunchReport ? (
            <DealerRankingExportButton
              params={exportParams}
              status={isCorrected ? 'corrected' : 'pending'}
              enabled={rows.length > 0}
            />
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X />
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
