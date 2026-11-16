import { Logger } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, Max, Min, MinLength, validateSync } from 'class-validator'

/**
 * Variables que el Nest necesita, validadas al arrancar (plans/plan-buenas-practicas-v0, 3.7;
 * https://docs.nestjs.com/techniques/configuration, «Custom validate function»). Si falta una, el contenedor no
 * arranca y el log dice cuál. **Los `EMAIL_*` no entran**: el boot nunca se cae por el mail (nest-email-sending.mdc);
 * los lee `commons/email/email.config.ts`.
 */
export const JWT_SECRET_MIN_PROD = 32

export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number

  @IsString()
  @IsNotEmpty()
  DB_HOST!: string

  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT!: number

  @IsString()
  @IsNotEmpty()
  DB_USERNAME!: string

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string

  @IsString()
  @IsNotEmpty()
  DB_DATABASE!: string

  /** El mismo JWT_AUTH del config.php. En producción, de 32 caracteres o más. */
  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  DB_POOL?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  DB_POOL_ACQUIRE_TIMEOUT_MS?: number

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  SRS_API_URL?: string

  @IsOptional()
  @IsString()
  JOBS_DB_DATABASE?: string

  @IsOptional()
  @IsIn(['true', 'false'])
  JOBS_CRON_ENABLED?: string

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  PAYROLL_SNAPSHOT_FROM?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  PAYROLL_SNAPSHOT_CHECK_MONTHS?: number
}

class ProductionSecret {
  @MinLength(JWT_SECRET_MIN_PROD, { message: `JWT_SECRET must be at least ${JWT_SECRET_MIN_PROD} characters in production` })
  JWT_SECRET!: string
}

/**
 * Un `JWT_SECRET` corto en producción **avisa en el log y arranca igual**: la clave es la misma `JWT_AUTH` del
 * `config.php` del legacy, y la de PROD tiene 9 caracteres (16/11/2026). Cambiarla deja afuera a todos (legacy, v0 y
 * app TTK), así que va como tarea aparte (`jwt-secret-corto-prod`, PLAN-GENERAL). Cuando esté cambiada, esto vuelve a
 * frenar el arranque.
 */
const logger = new Logger('EnvValidation')

/** `ConfigModule.forRoot({ validate })`: devuelve la config o tira con la lista de variables que fallan. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const trimmed = Object.fromEntries(
    Object.entries(config).map(([k, v]) => [k.trim(), typeof v === 'string' ? v.trim() : v]),
  )
  const env = plainToInstance(EnvironmentVariables, trimmed, { enableImplicitConversion: true })
  const errors = validateSync(env, { skipMissingProperties: false })
  if (trimmed.NODE_ENV === 'production' && typeof trimmed.JWT_SECRET === 'string' && trimmed.JWT_SECRET !== '') {
    for (const e of validateSync(plainToInstance(ProductionSecret, trimmed))) {
      logger.warn(`${e.property}: ${Object.values(e.constraints ?? {}).join(', ')} (tarea jwt-secret-corto-prod)`)
    }
  }
  if (errors.length > 0) {
    const lines = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
    throw new Error(`Invalid environment variables:\n  ${lines.join('\n  ')}`)
  }
  return config
}
