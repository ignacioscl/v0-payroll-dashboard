import { QueryRunner } from 'typeorm'

/**
 * Utilidades para migraciones de TypeORM
 */
export class MigrationUtils {
  /**
   * Deshabilita las verificaciones de clave foránea
   * @param queryRunner - Instancia de QueryRunner
   */
  static async disableForeignKeyChecks(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0;`)
  }

  /**
   * Habilita las verificaciones de clave foránea
   * @param queryRunner - Instancia de QueryRunner
   */
  static async enableForeignKeyChecks(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1;`)
  }

  /**
   * Ejecuta una función con las claves foráneas deshabilitadas
   * @param queryRunner - Instancia de QueryRunner
   * @param operation - Función a ejecutar
   */
  static async withDisabledForeignKeys<T>(queryRunner: QueryRunner, operation: () => Promise<T>): Promise<T> {
    try {
      await this.disableForeignKeyChecks(queryRunner)
      const result = await operation()
      await this.enableForeignKeyChecks(queryRunner)
      return result
    } catch (error) {
      // Asegurar que las claves foráneas se habiliten incluso si hay error
      await this.enableForeignKeyChecks(queryRunner)
      throw error
    }
  }

  /**
   * Elimina una tabla de forma segura (con claves foráneas deshabilitadas)
   * @param queryRunner - Instancia de QueryRunner
   * @param tableName - Nombre de la tabla a eliminar
   */
  static async dropTableSafely(queryRunner: QueryRunner, tableName: string): Promise<void> {
    await this.withDisabledForeignKeys(queryRunner, async () => {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${tableName}\`;`)
    })
  }

  /**
   * Elimina múltiples tablas en orden (dependientes primero)
   * @param queryRunner - Instancia de QueryRunner
   * @param tableNames - Array de nombres de tablas en orden de eliminación
   */
  static async dropTablesInOrder(queryRunner: QueryRunner, tableNames: string[]): Promise<void> {
    await this.withDisabledForeignKeys(queryRunner, async () => {
      for (const tableName of tableNames) {
        await queryRunner.query(`DROP TABLE IF EXISTS \`${tableName}\`;`)
      }
    })
  }
}
