import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsContext } from './srs-auth-context.service'
import { isExternalSession } from './srs-external-session'

/** Legacy ROL_ACCION: Invoices module access (`show-rol-action-15`). */
export const ROL_ACCION_INVOICES_MODULE_ACCESS = 15

/** Legacy ROL_ACCION: Invoices > Create Invoice (`show-rol-action-16`). */
export const ROL_ACCION_INVOICE_CREATE = 16

/** Legacy ROL_ACCION: Work Orders > Delete WO (`api.invoice.php:880-905`; WO to be Billed, T5). */
export const ROL_ACCION_WO_DELETE = 14

/** Legacy ROL_ACCION: Work Orders > Delete WO only in transit status (WO to be Billed, T5). */
export const ROL_ACCION_WO_DELETE_IN_TRANSIT = 79

/**
 * Legacy ROL_ACCION: Work Orders > Lock WO after Completed. Restringe: se consulta con `CHECK_USER_PERMISSION` y bloquea
 * si devuelve exactamente 1 (D16), no con `userHasRolAccion` (que a los Admin les da siempre «sí»).
 */
export const ROL_ACCION_WO_LOCK_AFTER_COMPLETED = 86

/**
 * Legacy ROL_ACCION: Work Orders > Modify PO & RO from WO when a Lock Date is set. Lo resuelve `CHECK_DATE_FREEZE`
 * (devuelve 2), que ya lo mira en la base (WO to be Billed, T6).
 */
export const ROL_ACCION_WO_MODIFY_PO_RO_LOCKED = 138

/** Legacy ROL_ACCION: Invoices > Print Invoice — also gates the export (D23). */
export const ROL_ACCION_INVOICE_PRINT = 19

/** Legacy ROL_ACCION: District filter in billing (`show-rol-action-69`). */
export const ROL_ACCION_BILLING_DISTRICT = 69

/** Invoices > Delete Generic Service — catalog soft-delete from the generic invoice modal. */
export const ROL_ACCION_GENERIC_SERVICE_DELETE = 145

/*
 * Un permiso por reporte de Pro (migration 033, tema 10 de plans/plan-reunion-juan-18-11). Sin roles al salir (D13): los
 * admins pasan siempre. Los del legacy que abrían estos reportes (47, 93, 123 y 140) gobiernan solo el legacy.
 * Mismos números en F/lib/auth/ttk-permissions.ts.
 */

/** Report Pro > Business KPIs: todas las tabs (Billing, Open AR, Punch Quality y Payroll Spend) y sus endpoints. */
export const ROL_ACCION_REPORT_BUSINESS_KPIS = 148

/** Report Pro > Production vs Goal by Dealer: la grilla y su Excel. */
export const ROL_ACCION_REPORT_PRODUCTION_VS_GOAL = 149

/** Report Pro > Income by Dealer: la pantalla, por servicio y los autos. */
export const ROL_ACCION_REPORT_INCOME_BY_DEALER = 150

/**
 * Report Pro > Monthly Closing (scope all). Quien lo tiene ve el payroll de cada empleado en el detalle. La compañía
 * necesita además el módulo «Closing reports» (`ContratistaService.assertCompanyModule`, D17).
 */
export const ROL_ACCION_REPORT_MONTHLY_CLOSING = 151

/** Report Pro > Window Tint Closing (scope tint), con el módulo «Closing reports» de la compañía. */
export const ROL_ACCION_REPORT_WINDOW_TINT_CLOSING = 152

/** Report Pro > Open Invoices: la pantalla, el Excel, las fotos y la comparación, con el módulo «Closing reports». */
export const ROL_ACCION_REPORT_OPEN_INVOICES = 153

/** Time Tracking menu / Punch Report (legacy show-rol-action-65). */
export const ROL_ACCION_TTK_ADMIN_HOURS = 65

/** Delete / view deleted punches (legacy show-rol-action-68). */
export const ROL_ACCION_DELETE_PUNCH = 68

/** Edit payment type (legacy 105). */
export const ROL_ACCION_EDIT_PAYMENT_TYPE = 105

/** View payment type name (legacy 130). */
export const ROL_ACCION_VIEW_PAYMENT_TYPE = 130

/** Edit payment type without viewing amounts (legacy 136). */
export const ROL_ACCION_EDIT_PAYMENT_TYPE_ALT = 136

/** Time Tracking > View Fake GPS (migration 004). Sin él, Fake GPS (flag 8) no se ve. */
export const ROL_ACCION_VIEW_FAKE_GPS = 146

/** Expenses > Allow adding expenses (legacy 110): Add Expense y las altas al vuelo de compañía/categoría. */
export const ROL_ACCION_EXPENSES_ADD = 110

/**
 * Expenses > Expense approval or reject permission (legacy 111): el menú Expenses, las cuatro pantallas de Pro,
 * aprobar/rechazar y toda la administración de reglas recurrentes y del catálogo (como el menú legacy).
 */
export const ROL_ACCION_EXPENSES_APPROVE = 111

/** Expenses > Add an expense on behalf of another employee (legacy 117): el combo «Assign to employee». */
export const ROL_ACCION_EXPENSES_ON_BEHALF = 117

/** Expenses > Allow edit expense (legacy 118): editar, borrar y restaurar gastos. */
export const ROL_ACCION_EXPENSES_EDIT = 118

/**
 * Expenses > Add Piecework expense (migration 032, plans/plan-reunion-juan-18-11 temas 3 y 4): el tipo Piecework de
 * Add Expense (las WO de un vendor como gasto). Sin roles asignados al salir; los admins pasan siempre.
 */
export const ROL_ACCION_EXPENSES_PIECEWORK = 147

/**
 * Port parcial de `PayrollPermissionService::userHasRolAccion` /
 * `getPermissionIds` → `loadAssignedRolAccionesForRole` → `RolDao::loadRolAccion`
 * con `idRolLeftJoin` + `existe === 1`.
 *
 * No lista todas las acciones: sólo responde si el usuario tiene UNA acción.
 * Sin cache de instancia: este provider es singleton, un Map acá no es "por
 * request" y un permiso recién asignado no tomaría efecto hasta reiniciar Nest.
 */
@Injectable()
export class SrsPermissionRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async userHasRolAccion(ctx: SrsContext, accionId: number): Promise<boolean> {
    const id = Number(accionId)
    if (!Number.isFinite(id) || id < 1) return false

    // Paridad isSystemAdmin PHP. ctx.idRol ya es el rol efectivo:
    // 1 Admin General (todas las compañías), 2 Admin Company (sólo su owner).
    if (ctx.idRol === 1 || ctx.idRol === 2) return true

    // Mirror RolDao::loadRolAccion with idRolLeftJoin: EXISTS on ROL_ACCION_REL
    // plus the role `tipo` filter (ra.tipo = r.tipo OR ra.tipo IS NULL).
    const rows = await this.srs.query(
      `SELECT 1 AS ok
       FROM usuarios u
       INNER JOIN ROL r ON r.id_rol = u.id_rol_system_v2
       INNER JOIN ROL_ACCION_REL rar
         ON rar.id_rol = u.id_rol_system_v2 AND rar.id_rol_accion = ?
       INNER JOIN ROL_ACCION ra ON ra.id = rar.id_rol_accion
       WHERE u.id_usuario = ?
         AND u.id_rol_system_v2 > 0
         AND (r.tipo IS NULL OR r.tipo = 0 OR ra.tipo IS NULL OR ra.tipo = r.tipo)
       LIMIT 1`,
      [id, ctx.idUsuario],
    )
    return rows.length > 0
  }

  async assertRolAccion(ctx: SrsContext, accionId: number): Promise<void> {
    if (!(await this.userHasRolAccion(ctx, accionId))) {
      throw new ForbiddenException('Forbidden')
    }
  }

  /** La sesión es de un usuario externo (regla y pareja en PHP: `srs-external-session.ts`). */
  isExternalSession(ctx: SrsContext): Promise<boolean> {
    return isExternalSession(ctx, this.srs)
  }

  /** 403 si la sesión no se puede comprobar interna (D7 de plans/plan-wo-to-be-billed-v0). */
  async assertInternalSession(ctx: SrsContext): Promise<void> {
    if (await this.isExternalSession(ctx)) {
      throw new ForbiddenException('Forbidden')
    }
  }
}
