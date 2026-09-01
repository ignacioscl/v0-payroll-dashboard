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
import { DEFAULT_ERROR_TYPES, isDefaultErrorTypes } from './repository/punch-error-types'

export type PunchAccessQuery = {
  idDealer: string
  issueType?: string
  idPaymentType?: number
  idEmployee?: number
  /** Forma canónica ya parseada (parseErrorTypes), no el string crudo. */
  errorTypes?: readonly number[]
}

export type PunchAccessPolicy = {
  canViewPaymentTypeName: boolean
  canViewPaymentAmounts: boolean
  dealerIds: number[]
  skipDealerRestriction: boolean
  /** `interno && lista parcial` — ver T.0.5 del plan. */
  includeErrorType: boolean
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

    if (issueType === 'only_deletes') {
      if (!(await this.permissions.userHasRolAccion(ctx, ROL_ACCION_DELETE_PUNCH))) {
        throw new ForbiddenException('You do not have permission to view deleted punches.')
      }
    }

    if (ctx.isUserDealer && issueType !== 'all') {
      throw new ForbiddenException('External users can only view all punches.')
    }

    const errorTypes = query.errorTypes ?? DEFAULT_ERROR_TYPES
    const defaultErrorTypes = isDefaultErrorTypes(errorTypes)
    if (ctx.isUserDealer && !defaultErrorTypes) {
      throw new ForbiddenException('External users can only view all punches.')
    }
    // El código de error por fila sólo existe cuando hay algo que re-decidir, y
    // nunca para un externo (que ni siquiera puede filtrar por tipo).
    const includeErrorType = !ctx.isUserDealer && !defaultErrorTypes

    const canViewPaymentTypeName =
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_VIEW_PAYMENT_TYPE)) ||
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE)) ||
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE_ALT))

    const canViewPaymentAmounts =
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE)) ||
      (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EDIT_PAYMENT_TYPE_ALT))

    if (query.idPaymentType || issueType === 'without_salary') {
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

    return {
      canViewPaymentTypeName,
      canViewPaymentAmounts,
      dealerIds,
      skipDealerRestriction,
      includeErrorType,
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
