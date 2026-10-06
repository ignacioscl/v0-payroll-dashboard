/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dotenv/config'

import { DataSourceOptions } from 'typeorm'
import { SnakeNamingStrategy } from 'typeorm-naming-strategies'

import { resolveTypeOrmLogging } from '../db-logging'

/**
 * Conexión a la base de los jobs (`srssui5_srs_jobs`): corridas, log y estado por período del
 * worker. Mismo servidor y usuario que la base de negocio (DB_*); solo cambia la base.
 *
 *  - synchronize / migrationsRun: false. El esquema va por la migration 010 corrida a mano.
 *  - Solo levanta entidades `*.jobsentity.ts`: el glob de la conexión default (`*.entity.ts`)
 *    no las ve y este no ve las de negocio.
 *  - No pasa por `addTransactionalDataSource`: las escrituras acá son de a una fila.
 *
 * Inyectar: `@InjectRepository(E, JOBS_CONNECTION)` / `@InjectDataSource(JOBS_CONNECTION)`.
 */
export const JOBS_CONNECTION = 'jobs'

export const jobsDataSourceOptions: DataSourceOptions = {
  name: JOBS_CONNECTION,
  type: (process.env.DB_CONNECTION?.trim() || 'mysql') as any,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '3306'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.JOBS_DB_DATABASE ?? 'srssui5_srs_jobs',
  charset: 'utf8mb4',
  entities: [`${__dirname}/../**/*.jobsentity{.ts,.js}`],
  synchronize: false, // NO NEGOCIABLE: el esquema va por migration
  namingStrategy: new SnakeNamingStrategy(),
  migrations: [],
  migrationsRun: false,
  timezone: 'Z',
  extra: {
    dateStrings: true,
    timezone: 'Z',
    // Cada corrida usa una conexión dedicada para el lock y otra para escribir JOB_RUN / log.
    connectionLimit: 4,
  },
  logging: resolveTypeOrmLogging(),
  logger: 'advanced-console',
}
