/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dotenv/config'

import { DataSource, DataSourceOptions } from 'typeorm'
import { SnakeNamingStrategy } from 'typeorm-naming-strategies'

export const dataSourceOptions: DataSourceOptions = {
  type: process.env.DB_CONNECTION as any,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '8100'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  //schema: process.env.DB_SCHEMA,
  entities: [`${__dirname}/**/**/*.entity{.ts,.js}`],
  synchronize: false, // NO NEGOCIABLE: nunca tocar el schema de la base
  namingStrategy: new SnakeNamingStrategy(),
  migrations: [],
  migrationsRun: false, // NO NEGOCIABLE: no correr migraciones sobre la base
  requestTimeout: 600000,
  timezone: 'Z', // Usar UTC para evitar problemas de zona horaria

  options: {
    encrypt: false, // Esto desactiva el uso de SSL
    trustServerCertificate: true, // Esto indica al servidor que confíe en el certificado del servidor
  },
  extra: {
    // Configuración adicional para manejo de fechas
    dateStrings: true,
    timezone: 'Z',
  },
  logging: process.env.DB_LOGGING == 'true',
  logger: 'advanced-console',
}

export default new DataSource(dataSourceOptions)
