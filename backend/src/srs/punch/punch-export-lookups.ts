import { DataSource } from 'typeorm'

import { SrsContext } from '../auth/srs-auth-context.service'
import type { PunchExportLocale } from './punch-export-format'
import { localeFromNavTemplate } from './punch-export-labels'

/*
 * Consultas de apoyo de los exports XLSX: idioma del libro, quién lo genera y los
 * nombres de dealers del Report Info. Vivían privadas en PunchExportService; se
 * movieron acá, recibiendo el DataSource, para que el export de Punch Report y el
 * del ranking de dealers las compartan sin duplicarlas. Mismo SQL que antes.
 */

/** Idioma del libro según `CONTRATISTA.type_nav_template` del provider (2 = español). */
export async function resolveLocale(srs: DataSource, ctx: SrsContext): Promise<PunchExportLocale> {
  if (!ctx.idDealerProvider) return localeFromNavTemplate(1)
  const rows: { type_nav_template?: number }[] = await srs.query(
    'SELECT type_nav_template FROM CONTRATISTA WHERE id = ? LIMIT 1',
    [ctx.idDealerProvider],
  )
  return localeFromNavTemplate(Number(rows[0]?.type_nav_template ?? 1))
}

/** Nombre de quien genera el export: sale de la sesión, nunca del pedido. */
export async function loadUserName(srs: DataSource, idUsuario: number): Promise<string> {
  const rows: { nombre?: string }[] = await srs.query(
    'SELECT nombre FROM usuarios WHERE id_usuario = ? LIMIT 1',
    [idUsuario],
  )
  return String(rows[0]?.nombre ?? idUsuario)
}

/**
 * Nombres de dealers con `GET_DEALER_NAME_BY_PROVIDER`. La función no mira el
 * scope: los ids tienen que llegar YA validados por la policy.
 */
export async function loadDealerNames(
  srs: DataSource,
  idDealerProvider: number,
  dealerIds: readonly number[],
): Promise<string[]> {
  if (dealerIds.length === 0) return []
  const names: string[] = []
  for (const id of dealerIds) {
    const rows: { name?: string }[] = await srs.query(
      'SELECT GET_DEALER_NAME_BY_PROVIDER(?, ?) AS name',
      [idDealerProvider, id],
    )
    names.push(String(rows[0]?.name ?? id))
  }
  return names
}
