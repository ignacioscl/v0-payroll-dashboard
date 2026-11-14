import { Matches } from 'class-validator'

/**
 * `:name` de `POST /jobs/:name/run` (plans/plan-buenas-practicas-v0, 3.5): todo `@Param` con pipe o esquema. Los
 * nombres de hoy (`car-vin-recheck`, `payroll-snapshot`, `watchdog`, `noop`) cumplen; el registro igual valida que
 * exista (`JobRegistryService.get`).
 */
export class JobNameParamDto {
  @Matches(/^[a-z0-9-]{1,64}$/)
  name!: string
}
