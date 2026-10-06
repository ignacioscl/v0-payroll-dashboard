/** Tipos compartidos del snapshot diario de payroll (plans/plan-payroll-spend). */

export type SnapshotConcepto = 'ponchada' | 'prorrateo' | 'overtime'

/** Configuración de payroll de la empresa (CONTRATISTA). */
export interface PayrollProviderConfig {
  idContratista: number
  /** 1 semanal, 2 quincenal, 3 mensual. null = sin configurar: la empresa se saltea. */
  paymentMethod: number | null
  firstDayWeek: number
  /** % de payroll tax de la empresa (CONTRATISTA.daily_report_payroll_tax). */
  payrollTaxPct: number
}

export interface PayrollPeriod {
  /** YYYY-MM-DD */
  desde: string
  /** YYYY-MM-DD */
  hasta: string
}

/** Una ponchada con lo que legacy calcula por ponchada (nivel 1 del DAO). */
export interface PunchSourceRow {
  id: number
  idAuthor: number
  idDealer: number
  /** DATE(punch_in), YYYY-MM-DD */
  fecha: string
  /** 'YYYY-MM-DD HH:MM:SS' — solo para ordenar */
  punchIn: string
  idPaymentType: number
  hourlyRate: number | null
  payrollTax: number | null
  /** TTK_CALCULATE_TIME_DAY(tipo, …, 0): horas solo si el tipo es Hourly. */
  horasHourly: number
  /** TTK_CALCULATE_TIME_DAY(tipo, …, 1): horas reales de la ponchada. */
  horas: number
  /** TTK_CALCULATE_TIME_DAY_JSON(tipo, …, payment 9999): horas solo si el tipo es Shop/H. */
  horasShopH: number
  /** GET_PIECEWORK_BY_EMPL_DATERANGE_PROV para tipos piecework; 0 en el resto. */
  piecework: number
  /** Misma función para Flat Rate; 0 en el resto. */
  flatRate: number
}

/** Piecework de un día de WO en el que el empleado no ponchó en ese dealer (UNION del DAO). */
export interface PieceworkDaySourceRow {
  idUsuario: number
  idDealer: number
  fecha: string
  payrollTax: number | null
  piecework: number
}

/** Ficha de salario o comisión vigente el primer día del período. */
export interface SalarySourceRow {
  idUsuario: number
  /** null = la ficha no tiene dealer («Without dealer»). */
  idDealer: number | null
  idPaymentType: number
  payment: number
  payrollTax: number | null
}

/** Fila de PAYROLL_SNAPSHOT_DAY tal como la arma el calculator. */
export interface SnapshotRow {
  idContratista: number
  idDealer: number | null
  idUsuario: number
  idPaymentType: number
  concepto: SnapshotConcepto
  fecha: string
  idPonchada: number | null
  horas: number
  monto: number
  montoTax: number
  tarifa: number | null
  periodoDesde: string
  periodoHasta: string
  diasPeriodo: number
  paymentMethod: number | null
  fechaCalculo: string
  calcVersion: number
}

export interface PeriodCalcInput {
  provider: PayrollProviderConfig
  periodo: PayrollPeriod
  /** Último día que entra al snapshot (hoy − 2 en New York). YYYY-MM-DD. */
  corte: string
  punchRows: PunchSourceRow[]
  pieceworkDayRows: PieceworkDaySourceRow[]
  salaryRows: SalarySourceRow[]
  /** 'YYYY-MM-DD HH:MM:SS' en UTC. */
  fechaCalculo: string
  calcVersion: number
  proratedDayId: number | null
}
