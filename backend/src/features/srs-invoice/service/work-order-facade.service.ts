import { BadRequestException, ConflictException, ForbiddenException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { Transactional } from 'typeorm-transactional'

import { fieldError } from 'src/commons/errors/field.error'
import { DataError } from 'src/commons/errors/data.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import {
  ROL_ACCION_WO_DELETE,
  ROL_ACCION_WO_DELETE_IN_TRANSIT,
  ROL_ACCION_WO_LOCK_AFTER_COMPLETED,
  SrsPermissionRepository,
} from 'src/srs/auth/srs-permission.repository'
import { checkDateFreezeSql } from 'src/srs/billing/billing-dealer-scope'
import { WORKFLOW_COMPLETED, WORKFLOW_IN_TRANSIT } from 'src/srs/billing/dto/wo-to-be-billed.dto'
import { WoToBeBilledRepository } from 'src/srs/billing/repository/wo-to-be-billed.repository'
import { WoToBeBilledService } from 'src/srs/billing/service/wo-to-be-billed.service'
import { LogChangeService } from 'src/features/srs-log-change/service/log-change.service'
import {
  DeleteWorkOrdersDto,
  DeleteWorkOrdersResponseDto,
  UpdateWorkOrderRoPoDto,
  WorkOrderRoPoResponseDto,
} from '../dto/work-order.dto'
import { WorkOrderRulesRepository } from '../repository/work-order-rules.repository'
import { WorkOrderService } from './work-order.service'

/** Textos de legacy (`RolAccion::$TXT_WORKORDER_COMPLETE`, `DealerRel::$MESSAGE_LOCKED`). */
export const MSG_WO_COMPLETED = 'The Work Order is Completed, permission denied to edit'
export const MSG_WO_LOCKED = 'The WOs on this dealer has been locked'
export const MSG_FORBIDDEN = 'Forbidden'
export const msgWoBilled = (fullNro: string) => `WO ${fullNro} is billed!`
/** Un error de base al eliminar una WO del lote (R6 de CODE-review.md): esa WO se deshace sola y el lote sigue. */
export const MSG_DELETE_FAILED = 'The work order could not be deleted. Try again.'
export const MSG_DELETE_ONE = 'Select one work order'
export const msgRequired = (field: 'ro' | 'po') =>
  field === 'ro' ? 'RO# is required for this work order' : 'PO# is required for this work order'

/**
 * Mayúsculas como legacy (`Invoice::getRo()` / `getPo()`, `strtoupper` de PHP): solo a–z. `toUpperCase()` alarga
 * algunos caracteres («ß» → «SS») y el valor pasaría el ancho de la columna (R14 de CODE-review.md).
 */
export function legacyUpper(value: string): string {
  return value.replace(/[a-z]/g, (c) => c.toUpperCase())
}

const ROL_ADMIN_GENERAL = 1
const ROL_ADMIN_COMPANY = 2

/** Un motivo de no eliminar: vuelve en `failed` y deshace esa WO sola. */
class DeleteRefused extends Error {
  constructor(
    readonly reason: string,
    readonly fullNro?: string,
  ) {
    super(reason)
  }
}

/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T5 y T6): eliminar WO y editar RO# / PO#. Cada escritura en su propia
 * transacción (`@Transactional()`), con las validaciones antes de escribir, el `UPDATE` condicional que cuenta filas y
 * su línea en `LOG_CHANGE`. Las reglas quedan escritas también en PHP mientras exista legacy (D13, tarea
 * `unificar-reglas-wo`).
 */
@Injectable()
export class WorkOrderFacadeService {
  private readonly logger = new Logger(WorkOrderFacadeService.name)

  constructor(
    private readonly workOrders: WorkOrderService,
    private readonly rules: WorkOrderRulesRepository,
    private readonly logs: LogChangeService,
    private readonly permissions: SrsPermissionRepository,
    private readonly screen: WoToBeBilledService,
    private readonly woToBeBilled: WoToBeBilledRepository,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  // ------------------------------------------------------------------ eliminar

  /** D11: un pedido, una transacción por WO, resultado por WO. 403 del pedido entero solo por el control de la pantalla. */
  async delete(ctx: SrsContext, dto: DeleteWorkOrdersDto): Promise<DeleteWorkOrdersResponseDto> {
    await this.screen.assertScreenAccess(ctx)
    const ids = [...new Set(dto.ids)]
    // El tacho de la fila es de a una (79 + tacho); el lote pide 14 aunque traiga una sola (R7 de CODE-review.md).
    if (!dto.bulk && ids.length !== 1) throw new BadRequestException(MSG_DELETE_ONE)
    const canDelete = await this.permissions.userHasRolAccion(ctx, ROL_ACCION_WO_DELETE)
    const canDeleteInTransit = await this.permissions.userHasRolAccion(ctx, ROL_ACCION_WO_DELETE_IN_TRANSIT)
    const trash =
      ctx.idRol === ROL_ADMIN_GENERAL ? true : await this.woToBeBilled.hasTrashIcon(ctx.idUsuario, ctx.idUsuarioRolrel)

    const out: DeleteWorkOrdersResponseDto = { deleted: [], failed: [] }
    for (const id of ids) {
      try {
        const fullNro = await this.deleteOneTx(ctx, id, dto.bulk, { canDelete, canDeleteInTransit, trash })
        out.deleted.push({ id, fullNro })
      } catch (err) {
        if (err instanceof DeleteRefused) {
          out.failed.push(err.fullNro ? { id, fullNro: err.fullNro, reason: err.reason } : { id, reason: err.reason })
          continue
        }
        // Un error de base o del log: la transacción de esta WO ya se deshizo; las anteriores quedan confirmadas y el
        // lote sigue, con esta WO en `failed` (D11; R6 de CODE-review.md). Sin número: no se sabe si se llegó a leer.
        this.logger.error({ msg: 'wo-delete-failed', idInvoice: id, error: err instanceof Error ? err.message : String(err) })
        out.failed.push({ id, reason: MSG_DELETE_FAILED })
      }
    }
    return out
  }

  @Transactional()
  async deleteOneTx(
    ctx: SrsContext,
    id: number,
    bulk: boolean,
    perms: { canDelete: boolean; canDeleteInTransit: boolean; trash: boolean },
  ): Promise<string> {
    // 1. El alcance va en la misma lectura que trae la WO: si no es de la empresa o su dealer no está en alcance, solo el id.
    const wo = await this.rules.loadScoped(id, ctx.idDealerProvider)
    if (!wo) throw new DeleteRefused(MSG_FORBIDDEN)
    try {
      await this.screen.assertDealerInScope(ctx, wo.idDealer)
    } catch (err) {
      if (err instanceof ForbiddenException) throw new DeleteRefused(MSG_FORBIDDEN)
      throw err
    }
    // 2. Permiso: 14, o 79 con la WO In Transit; una por una pide además el tacho del rol (`has_trash_icon`).
    const allowed = bulk
      ? perms.canDelete
      : perms.trash && (perms.canDelete || (perms.canDeleteInTransit && wo.idWorkflow === WORKFLOW_IN_TRANSIT))
    if (!allowed) throw new DeleteRefused(MSG_FORBIDDEN, wo.fullNro)
    // 3. Activa.
    if (wo.estado !== 1) throw new DeleteRefused(MSG_FORBIDDEN, wo.fullNro)
    // 4. Completed + no Admin + «Lock WO after Completed» (D16: CHECK_USER_PERMISSION, bloquea si devuelve exactamente 1).
    if (
      wo.idWorkflow === WORKFLOW_COMPLETED &&
      ctx.idRol !== ROL_ADMIN_GENERAL &&
      ctx.idRol !== ROL_ADMIN_COMPANY &&
      (await this.rules.checkUserPermission(ctx.idUsuario, wo.idDealer, ROL_ACCION_WO_LOCK_AFTER_COMPLETED)) === 1
    ) {
      throw new DeleteRefused(MSG_WO_COMPLETED, wo.fullNro)
    }
    // 5. Lock Date contra la fecha de alta.
    if ((await checkDateFreezeSql(this.db, ctx.idUsuario, wo.idDealer, ctx.idDealerProvider, wo.fechaAltaDate)) === 0) {
      throw new DeleteRefused(MSG_WO_LOCKED, wo.fullNro)
    }
    // 6. Pagada.
    if (await this.rules.isWoBilled(wo.id)) throw new DeleteRefused(msgWoBilled(wo.fullNro), wo.fullNro)
    // 7. El UPDATE condicional cuenta filas: si no fue una, otro la eliminó en el medio.
    const affected = await this.workOrders.markDeleted(wo.id, ctx.idDealerProvider)
    if (affected !== 1) throw new DeleteRefused(MSG_FORBIDDEN, wo.fullNro)
    // 8. Log, con el texto de legacy (`LogChangeService::saveLogDeleteInvoice`).
    await this.logs.logWorkOrder(wo.id, ctx.idUsuario, `Invoice #${wo.fullNro} deleted`)
    return wo.fullNro
  }

  // ------------------------------------------------------------------ RO# / PO#

  async updateRoPo(ctx: SrsContext, idInvoice: number, dto: UpdateWorkOrderRoPoDto): Promise<WorkOrderRoPoResponseDto> {
    await this.screen.assertScreenAccess(ctx)
    return this.updateRoPoTx(ctx, idInvoice, dto)
  }

  @Transactional()
  async updateRoPoTx(ctx: SrsContext, idInvoice: number, dto: UpdateWorkOrderRoPoDto): Promise<WorkOrderRoPoResponseDto> {
    // 0. Candado de la fila, primera sentencia: dos ediciones de la misma WO se esperan y lo que se lee abajo (el valor
    //    anterior del log, el otro campo de la respuesta) es lo último confirmado (R15 de CODE-review.md).
    await this.rules.lockWorkOrder(idInvoice, ctx.idDealerProvider)
    // 1. La WO, activa, de la empresa y de un dealer en alcance; si no, 403 sin ningún dato.
    const wo = await this.rules.loadScoped(idInvoice, ctx.idDealerProvider)
    if (!wo || wo.estado !== 1) throw new ForbiddenException(MSG_FORBIDDEN)
    await this.screen.assertDealerInScope(ctx, wo.idDealer)
    // 2. Lock Date (§3, pregunta 2): 0 corta; 2 (permiso «Modify PO & RO … Lock Date») pasa.
    if ((await checkDateFreezeSql(this.db, ctx.idUsuario, wo.idDealer, ctx.idDealerProvider, wo.fechaAltaDate)) === 0) {
      throw new DataError(HttpStatus.BAD_REQUEST, MSG_WO_LOCKED, HttpStatus.BAD_REQUEST)
    }
    // 3. Mayúsculas y '' como nulo (`Invoice.php:287-293`).
    const upper = legacyUpper(dto.value.trim())
    const value = upper === '' ? null : upper
    // 4. Obligatorio.
    const rules = await this.rules.roPoRules(wo.id, ctx.idUsuario, wo.idDealer, ctx.idDealerProvider, wo.idDepartment)
    const required = dto.field === 'ro' ? rules.roRequired : rules.poRequired
    if (value == null && required) throw fieldError('value', msgRequired(dto.field))
    // 5. Sin cambio: no se escribe ni se anota.
    const before = dto.field === 'ro' ? wo.ro : wo.po
    if ((before ?? null) === value) return { ro: wo.ro, po: wo.po }
    // 6. Un solo UPDATE con el campo y las tres marcas; cuenta filas.
    const affected = await this.workOrders.updateRoPo(wo.id, ctx.idDealerProvider, dto.field, value, {
      roSemi: rules.roSemi,
      poSemi: rules.poSemi,
      stockSemi: rules.stockSemi,
    })
    if (affected !== 1) throw new ConflictException('The work order changed. Reload and try again.')
    // 7. Log con el texto literal de legacy (`api.datatable.edit.php:66-72`): el valor nuevo **como se escribió**, no
    //    el de mayúsculas que se guarda (legacy anota `$value` del pedido; la paridad del 25/11/2026 lo encontró).
    const label = dto.field === 'ro' ? 'RO#' : 'PO#'
    await this.logs.logWorkOrder(wo.id, ctx.idUsuario, `${label} edited from ${before ?? ''} to:${dto.value.trim()}`)
    return dto.field === 'ro' ? { ro: value, po: wo.po } : { ro: wo.ro, po: value }
  }
}
