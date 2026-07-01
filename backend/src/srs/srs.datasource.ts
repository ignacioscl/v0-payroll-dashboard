/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dotenv/config'

import { DataSource, DataSourceOptions } from 'typeorm'

import { resolveTypeOrmLogging } from '../db-logging'

/**
 * DataSource hacia la base LEGACY de SRS (MariaDB), compartida con el monolito PHP.
 *
 *  - Conexión NOMBRADA 'srs' para no chocar con el DataSource principal de la app.
 *  - synchronize: false SIEMPRE — el backend nunca altera el schema que el PHP usa.
 *  - Sin migraciones de TypeORM sobre tablas legacy.
 *  - Solo agarra entidades *.srsentity.ts (las legacy).
 *
 * Inyectar repos de esta conexión:  @InjectRepository(Invoice, 'srs')  / @InjectDataSource('srs')
 */
export const SRS_CONNECTION = 'srs'

// Lee la MISMA y ÚNICA config de base (DB_*). No hay una segunda base.
export const srsDataSourceOptions: DataSourceOptions = {
  name: SRS_CONNECTION,
  type: (process.env.DB_CONNECTION ?? 'mysql') as any,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '3306'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  charset: 'utf8mb4',
  entities: [`${__dirname}/**/*.srsentity{.ts,.js}`],
  synchronize: false, // NO NEGOCIABLE: nunca tocar el schema
  migrations: [],
  migrationsRun: false,
  timezone: 'Z',
  extra: {
    dateStrings: true,
    timezone: 'Z',
    connectionLimit: parseInt(process.env.DB_POOL ?? '5'),
  },
  logging: resolveTypeOrmLogging(),
  logger: 'advanced-console',
}

export default new DataSource(srsDataSourceOptions)
