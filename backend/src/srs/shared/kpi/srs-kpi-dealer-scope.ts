import type { DataSource } from 'typeorm'

import type { SrsKpiFilter } from './srs-kpi-filter'

/**
 * Cuántos de los dealers pedidos son de la empresa (DEALER_REL) y, para un usuario restringido, visibles
 * (RESTRICTION_DEALER_V2). Lo usan los exports que nombran los dealers pedidos con GET_DEALER_NAME_BY_PROVIDER, que no
 * mira el alcance: Production vs Goal y Monthly Closing. Vivía en ProductionKpiRepository.
 */
export async function countRequestedDealersInScope(
  srs: Pick<DataSource, 'query'>,
  filter: Pick<SrsKpiFilter, 'dealerIds' | 'idDealerProvider' | 'idUsuario' | 'skipDealerRestriction'>,
): Promise<number> {
  const ids = [...new Set(filter.dealerIds)]
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const restriction = filter.skipDealerRestriction ? '' : 'AND RESTRICTION_DEALER_V2(?, dr.id_dealer_customer) = 1'
  const params: number[] = [filter.idDealerProvider, ...ids]
  if (!filter.skipDealerRestriction) params.push(filter.idUsuario)
  const rows: { n: number | string }[] = await srs.query(
    `SELECT COUNT(DISTINCT dr.id_dealer_customer) AS n
     FROM DEALER_REL dr
     WHERE dr.id_dealer_provider = ?
       AND dr.id_dealer_customer IN (${placeholders})
       ${restriction}`,
    params,
  )
  return Number(rows[0]?.n ?? 0)
}
