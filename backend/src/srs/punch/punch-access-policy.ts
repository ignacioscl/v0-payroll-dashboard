import { Injectable, ForbiddenException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsContext } from '../auth/srs-auth-context.service'
import {
  ROL_ACCION_DELETE_PUNCH,
  ROL_ACCION_EDIT_PAYMENT_TYPE,
  ROL_ACCION_EDIT_PAYMENT_TYPE_ALT,
  ROL_ACCION_TTK_ADMIN_HOURS,
  ROL_ACCION_VIEW_PAYMENT_TYPE,
  SrsPermissionRepository,
} from '../auth/srs-permission.repository'
import { parseDealerIds, skipDealerRestrictionForRol } from '../shared/kpi/srs-kpi-dealer-filter'
import { DEFAULT_ERROR_TYPES, effectiveErrorTypes, isDefaultErrorTypes } from './repository/punch-error-types'

export type PunchAccessQuery = {
  idDealer: string
  issueType?: string
  /** Forma canonica ya parseada (parsePaymentTypeIds), no el string crudo. */
  idPaymentTypes?: readonly number[]
  /**
   * Ordenar POR payment type tambien es usarlo: el LEFT JOIN a GENERIC_DATA
   * esta siempre en el FROM, asi que sin este campo quien no tiene el permiso
   * no ve la columna pero igual recibe las filas ordenadas por el valor oculto.
   */
  sort?: string
  idEmployee?: number
  /** Forma canónica ya parseada (parseErrorTypes), no el string crudo. */
  errorTypes?: readonly number[]
}

export type PunchAccessPolicy = {
  canViewPaymentTypeName: boolean
  canViewPaymentAmounts: boolean
  dealerIds: number[]
  skipDealerRestriction: boolean
  /** `interno && lista V2 parcial` — ver T.0.5 del plan. */
  includeErrorType: boolean
  /**
   * Si las correcciones sobre ponchadas ya eliminadas entran a la lista.
   *
   * En modo `only_fixed` NO es un 403: el modo está permitido y lo que se recorta es
   * el subconjunto. Una ponchada corregida y después borrada sigue siendo una
   * corrección, pero VERLA exige `Punch > Delete Punch`.
   */
  includeDeletedFixes: boolean
  /**
   * Lista blanca YA recortada por permiso (T.0.6). Es la que entra a filtros,
   * agregados, ranking y export. 4/7 salen sin pago; 6 sale sin delete.
   */
  effectiveErrorTypes: readonly number[]
}

@Injectable()
export class PunchAccessPolicyService {
  constructor(
    private readonly permissions: SrsPermissionRepository,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
  ) {}

  async assertAndResolve(ctx: SrsContext, query: PunchAccessQuery): Promise<PunchAccessPolicy> {
    if (!(await this.permissions.userHasRolAccion(ctx, ROL_ACCION_TTK_ADMIN_HOURS))) {
      throw new ForbiddenException('You do not have permission to open Punch Report.')
    }

    const issueType = (query.issueType ?? 'all').trim() || 'all'

    // Corrected lista tambien ponchadas eliminadas (una correccion sobre una ponchada
    // despues borrada sigue siendo una correccion). Quien no puede ver eliminadas,
    // las ve excluidas -no un 403-: el modo Corrected en si esta permitido.
    const includeDeletedFixes = await this.resolveDeletedVisibility(ctx)

    if (issueType === 'only_deletes' && !includeDeletedFixes) {
      throw new ForbiddenException('You do not have permission to view deleted punches.')
    }

    if (ctx.isUserDealer && issueType !== 'all') {
      throw new ForbiddenException('External users can only view all punches.')
    }

    const errorTypes = query.errorTypes ?? DEFAULT_ERROR_TYPES
    const defaultErrorTypes = isDefaultErrorTypes(errorTypes)
    if (ctx.isUserDealer && !defaultErrorTypes) {
      throw new ForbiddenException('External users can only view all punches.')
    }
    // El código de error V2 por fila sólo existe cuando hay algo que re-decidir.
    const includeErrorType = !ctx.isUserDealer && !defaultErrorTypes

    const canViewPaymentTypeName =
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_VIEW_PAYMENT_TYPE)) ||
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE)) ||
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE_ALT))

    const canViewPaymentAmounts =
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE)) ||
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE_ALT))

    const usesPaymentType =
      (query.idPaymentTypes?.length ?? 0) > 0 ||
      issueType === 'without_salary' ||
      query.sort === 'paymentType'

    if (usesPaymentType) {
      if (!canViewPaymentTypeName) {
        throw new ForbiddenException('You do not have permission to filter by payment type.')
      }
    }

    const dealerIds = [...new Set(parseDealerIds(query.idDealer))]
    const skipDealerRestriction = skipDealerRestrictionForRol(ctx.idRol)
    await this.assertDealersInScope(ctx, dealerIds, skipDealerRestriction)

    if (query.idEmployee) {
      await this.assertEmployeeInScope(ctx, query.idEmployee, dealerIds, skipDealerRestriction)
    }

    const resolvedTypes = effectiveErrorTypes(errorTypes, {
      canViewPaymentType: canViewPaymentTypeName,
      includeDeletedFixes,
      isExternal: ctx.isUserDealer,
    })

    return {
      canViewPaymentTypeName,
      canViewPaymentAmounts,
      dealerIds,
      skipDealerRestriction,
      includeErrorType,
      includeDeletedFixes,
      effectiveErrorTypes: resolvedTypes,
    }
  }

  /**
   * Gate ESTRECHO: consulta sólo la acción de eliminar ponchadas.
   *
   * Existe para que los KPI no tengan que pasar por `assertAndResolve()`, que
   * **empieza** exigiendo la acción de Punch Report. El consumidor vivo de los KPI
   * es `/reports/business-kpis`, que se autoriza con Admin o Production Report: un
   * usuario legítimo con Production Report y sin Punch Report hoy ve los KPI, y
   * reusar el gate completo le metería un 403 donde hoy no lo hay.
   */
  async resolveDeletedVisibility(ctx: SrsContext): Promise<boolean> {
    return this.permissions.userHasRolAccion(ctx, ROL_ACCION_DELETE_PUNCH)
  }

  /**
   * Gate del ranking de dealers del Dashboard (la tarjeta "Dealers with most
   * errors" y su modal).
   *
   * NO exige la acción de Punch Report (*Time Tracking > Hours Admin.*, 65): es
   * paridad con el resumen PHP al que reemplaza, que sólo pide estar logueado
   * (`ttk-dashboard-summary.php`). Exigirla le vaciaría la tarjeta a quien hoy la ve.
   * El export del ranking SÍ la exige: pasa por `assertAndResolve()` completo y,
   * además, por `assertDealersRelatedToProvider()`.
   */
  async assertDashboardRanking(
    ctx: SrsContext,
    idDealer: string,
    errorTypes: readonly number[] = DEFAULT_ERROR_TYPES,
  ): Promise<
    Pick<
      PunchAccessPolicy,
      | 'dealerIds'
      | 'skipDealerRestriction'
      | 'includeDeletedFixes'
      | 'effectiveErrorTypes'
      | 'canViewPaymentTypeName'
    >
  > {
    // Externos afuera: Punch Report ya les prohíbe mirar por errores, y el ranking
    // no es otra cosa. Tampoco ven el Dashboard (el front los manda a /issues).
    if (ctx.isUserDealer) {
      throw new ForbiddenException('External users cannot view the dealers ranking.')
    }

    const dealerIds = [...new Set(parseDealerIds(idDealer))]
    const skipDealerRestriction = skipDealerRestrictionForRol(ctx.idRol)
    await this.assertDealersInScope(ctx, dealerIds, skipDealerRestriction)
    await this.assertDealersRelatedToProvider(ctx, dealerIds)

    // Correcciones sobre ponchadas eliminadas: el mismo recorte que los KPI y que
    // `getFixFrom()` en PHP.
    const includeDeletedFixes = await this.resolveDeletedVisibility(ctx)

    const canViewPaymentTypeName =
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_VIEW_PAYMENT_TYPE)) ||
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE)) ||
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE_ALT))

    const resolvedTypes = effectiveErrorTypes(errorTypes, {
      canViewPaymentType: canViewPaymentTypeName,
      includeDeletedFixes,
      isExternal: false,
    })

    return {
      dealerIds,
      skipDealerRestriction,
      includeDeletedFixes,
      canViewPaymentTypeName,
      effectiveErrorTypes: resolvedTypes,
    }
  }

  /**
   * Cada dealer pedido tiene que estar relacionado con el provider del que llama en
   * `DEALER_REL`. Es la misma condición con la que el header arma el combo de
   * dealers (`ContratistaDao.php`, filtro `idDealerProv`, sin mirar `fecha_end`), así
   * que nunca rechaza un dealer que el combo ofrece.
   *
   * Cierra el caso del Admin (rol 1/2): para él `assertDealersInScope` sólo verifica
   * que el dealer exista, y el Report Info de un export nombraría (con
   * `GET_DEALER_NAME_BY_PROVIDER`, que no mira el scope) un dealer de otro cliente.
   * Mismo mensaje que `assertDealersInScope`: el 403 no dice cuál de los dos falló.
   */
  async assertDealersRelatedToProvider(ctx: SrsContext, dealerIds: readonly number[]): Promise<void> {
    const ids = [...new Set(dealerIds)]
    if (ids.length === 0) {
      throw new ForbiddenException('Forbidden')
    }
    const placeholders = ids.map(() => '?').join(',')
    const rows: { n: number | string }[] = await this.srs.query(
      `SELECT COUNT(DISTINCT dr.id_dealer_customer) AS n
       FROM DEALER_REL dr
       WHERE dr.id_dealer_provider = ?
         AND dr.id_dealer_customer IN (${placeholders})`,
      [ctx.idDealerProvider, ...ids],
    )
    if (Number(rows[0]?.n ?? 0) !== ids.length) {
      throw new ForbiddenException('One or more dealers are outside your scope.')
    }
  }

  /**
   * Requested dealer ids must all pass RESTRICTION_DEALER_V2 (unless Admin 1/2).
   * Do not look up names first — GET_DEALER_NAME_BY_PROVIDER is unscoped.
   */
  private async assertDealersInScope(
    ctx: SrsContext,
    dealerIds: number[],
    skipDealerRestriction: boolean,
  ): Promise<void> {
    if (dealerIds.length === 0) {
      throw new ForbiddenException('Forbidden')
    }
    const placeholders = dealerIds.map(() => '?').join(',')
    const sql = skipDealerRestriction
      ? `SELECT COUNT(DISTINCT c.id) AS n FROM CONTRATISTA c WHERE c.id IN (${placeholders})`
      : `SELECT COUNT(DISTINCT c.id) AS n
         FROM CONTRATISTA c
         WHERE c.id IN (${placeholders})
           AND RESTRICTION_DEALER_V2(?, c.id) = 1`
    const params = skipDealerRestriction ? [...dealerIds] : [...dealerIds, ctx.idUsuario]
    const rows: { n: number | string }[] = await this.srs.query(sql, params)
    if (Number(rows[0]?.n ?? 0) !== dealerIds.length) {
      throw new ForbiddenException('One or more dealers are outside your scope.')
    }
  }

  /**
   * 403 only if the employee is outside the provider / authorized dealers.
   * Zero punches in the requested date range is allowed.
   * Never SELECT nombre first — usuarios is global.
   */
  private async assertEmployeeInScope(
    ctx: SrsContext,
    idEmployee: number,
    dealerIds: number[],
    skipDealerRestriction: boolean,
  ): Promise<void> {
    const placeholders = dealerIds.map(() => '?').join(',')
    const restriction = skipDealerRestriction ? '' : ' AND RESTRICTION_DEALER_V2(?, c.id) = 1'
    const params: (string | number)[] = [idEmployee, ...dealerIds]
    if (!skipDealerRestriction) params.push(ctx.idUsuario)
    params.push(ctx.idDealerProvider, ...dealerIds)
    if (!skipDealerRestriction) params.push(ctx.idUsuario)

    const rows: { ok: number }[] = await this.srs.query(
      `SELECT 1 AS ok
       FROM usuarios u
       WHERE u.id_usuario = ?
         AND (
           EXISTS (
             SELECT 1
             FROM USUARIO_ROL_REL urr
             INNER JOIN CONTRATISTA c ON c.id = urr.id_dealer_asigned
             WHERE urr.id_usuario = u.id_usuario
               AND c.id IN (${placeholders})
               ${restriction}
           )
           OR EXISTS (
             SELECT 1
             FROM TTK_EMPLOYEE_WORK tew
             INNER JOIN CONTRATISTA c ON c.id = tew.id_dealer
             WHERE tew.id_author = u.id_usuario
               AND tew.id_dealer_provider = ?
               AND c.id IN (${placeholders})
               ${restriction}
           )
         )
       LIMIT 1`,
      params,
    )

    if (rows.length === 0) {
      throw new ForbiddenException('The employee is outside your scope.')
    }
  }
}
