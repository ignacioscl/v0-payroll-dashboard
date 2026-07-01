import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'

import { AuditLog, AuditAction } from '../entity/audit-log.entity'
import { AuditLogService } from './audit-log.service'
import { AuditLogQueryDto } from '../dto/audit-log.dto'

export interface AuditLogData {
  tableName: string
  recordId: number
  action: AuditAction
  changes: {
    before: any | null
    after: any | null
  }
  changedFields: string[]
  userId?: number | null
  ipAddress?: string | null
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @Inject(forwardRef(() => AuditLogService))
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Registra un log de auditoría
   */
  async log(data: AuditLogData): Promise<AuditLog> {
    try {
      console.log('💾 AuditService: Creando log de auditoría', {
        tableName: data.tableName,
        recordId: data.recordId,
        action: data.action,
      })

      const auditLog = new AuditLog()
      auditLog.tableName = data.tableName
      auditLog.recordId = data.recordId
      auditLog.action = data.action
      auditLog.changes = data.changes
      auditLog.changedFields = data.changedFields
      auditLog.userId = data.userId || undefined
      auditLog.ipAddress = data.ipAddress || undefined

      const saved = await this.auditLogRepository.save(auditLog)
      console.log('✅ AuditService: Log guardado con ID', saved.id)
      return saved
    } catch (error) {
      console.error('❌ AuditService: Error guardando log de auditoría:', error)
      // No lanzar error para no interrumpir la operación principal
      throw error
    }
  }

  /**
   * Obtiene logs con relaciones cargadas en before/after
   */
  async getLogsWithRelations(query: AuditLogQueryDto): Promise<AuditLog[]> {
    // Usar el fetch existente para obtener logs paginados
    const paginatedResult = await this.auditLogService.fetch(query)

    console.log('🔍 [getLogsWithRelations] Logs obtenidos del fetch:', paginatedResult.data.length)

    // Log detallado ANTES del enriquecimiento
    paginatedResult.data.forEach((log, index) => {
      console.log(`\n📋 [getLogsWithRelations] Log ${index} (ID: ${log.id}) ANTES de enriquecer:`)
      console.log(`  - recordId: ${log.recordId}`)
      console.log(`  - action: ${log.action}`)
      console.log(`  - changedFields:`, log.changedFields)
      console.log(`  - before.id: ${log.changes?.before?.id}`)
      console.log(`  - after.id: ${log.changes?.after?.id}`)
      console.log(`  - before === after (referencia): ${log.changes?.before === log.changes?.after}`)

      // Mostrar valores de los campos que cambiaron
      if (log.changedFields && log.changedFields.length > 0) {
        console.log(`  📊 Valores de campos cambiados ANTES:`)
        log.changedFields.forEach(field => {
          const beforeValue = log.changes?.before?.[field]
          const afterValue = log.changes?.after?.[field]
          const areEqual = JSON.stringify(beforeValue) === JSON.stringify(afterValue)
          console.log(`    - ${field}:`)
          console.log(`      before: ${JSON.stringify(beforeValue)}`)
          console.log(`      after:  ${JSON.stringify(afterValue)}`)
          console.log(`      iguales: ${areEqual}`)
        })
      }
    })

    // Enriquecer cada log con relaciones (creando copias para no mutar el original)
    const enrichedLogs = await Promise.all(
      paginatedResult.data.map((log, index) => {
        console.log(`\n🔄 [getLogsWithRelations] Enriqueciendo log ${index} (ID: ${log.id})`)
        return this.enrichLogWithRelations(log, index)
      }),
    )

    console.log('\n✅ [getLogsWithRelations] Logs enriquecidos completados')

    // Log detallado DESPUÉS del enriquecimiento
    enrichedLogs.forEach((log, index) => {
      console.log(`\n📋 [getLogsWithRelations] Log ${index} (ID: ${log.id}) DESPUÉS de enriquecer:`)
      console.log(`  - changedFields:`, log.changedFields)
      console.log(`  - before.id: ${log.changes?.before?.id}`)
      console.log(`  - after.id: ${log.changes?.after?.id}`)
      console.log(`  - before === after (referencia): ${log.changes?.before === log.changes?.after}`)

      // Mostrar valores de los campos que cambiaron
      if (log.changedFields && log.changedFields.length > 0) {
        console.log(`  📊 Valores de campos cambiados DESPUÉS:`)
        log.changedFields.forEach(field => {
          const beforeValue = log.changes?.before?.[field]
          const afterValue = log.changes?.after?.[field]
          const areEqual = JSON.stringify(beforeValue) === JSON.stringify(afterValue)
          console.log(`    - ${field}:`)
          console.log(`      before: ${JSON.stringify(beforeValue)}`)
          console.log(`      after:  ${JSON.stringify(afterValue)}`)
          console.log(`      iguales: ${areEqual}`)
        })
      }
    })

    // Verificar si paginatedResult fue mutado
    console.log('\n🔍 [getLogsWithRelations] Verificando si paginatedResult fue mutado:')
    paginatedResult.data.forEach((log, index) => {
      console.log(`  Log ${index} (ID: ${log.id}):`)
      console.log(`    - before.id: ${log.changes?.before?.id}`)
      console.log(`    - after.id: ${log.changes?.after?.id}`)
      console.log(`    - before === after: ${log.changes?.before === log.changes?.after}`)
    })

    return enrichedLogs
  }

  private async enrichLogWithRelations(log: AuditLog, logIndex: number): Promise<AuditLog> {
    console.log(`\n🔧 [enrichLogWithRelations] Log ${logIndex} (ID: ${log.id}) - Iniciando enriquecimiento`)
    console.log(`  - tableName: ${log.tableName}`)
    console.log(`  - before.id: ${log.changes?.before?.id}`)
    console.log(`  - after.id: ${log.changes?.after?.id}`)
    console.log(`  - before === after (referencia): ${log.changes?.before === log.changes?.after}`)

    // Crear una copia profunda del log para no mutar el original
    const logCopy = JSON.parse(JSON.stringify(log)) as AuditLog
    // Restaurar propiedades que no se serializan bien
    logCopy.id = log.id
    logCopy.createdAt = log.createdAt
    logCopy.user = log.user

    console.log(
      `  - logCopy creado, before.id: ${logCopy.changes?.before?.id}, after.id: ${logCopy.changes?.after?.id}`,
    )
    console.log(
      `  - logCopy.before === logCopy.after (referencia): ${logCopy.changes?.before === logCopy.changes?.after}`,
    )

    // Encontrar la entidad por tableName
    const entityMetadata = this.dataSource.entityMetadatas.find(meta => meta.tableName === logCopy.tableName)

    if (!entityMetadata) {
      console.log(`  ⚠️  No se encontró metadata para tabla: ${logCopy.tableName}`)
      return logCopy
    }

    const repository = this.dataSource.getRepository(entityMetadata.target)
    const relations = entityMetadata.relations.map(rel => rel.propertyName)
    console.log(`  - Relaciones encontradas:`, relations)

    // Mostrar valores ANTES de cargar desde BD
    if (logCopy.changedFields && logCopy.changedFields.length > 0) {
      console.log(`  📊 Valores ANTES de cargar desde BD:`)
      logCopy.changedFields.forEach(field => {
        const beforeValue = logCopy.changes?.before?.[field]
        const afterValue = logCopy.changes?.after?.[field]
        console.log(`    - ${field}: before=${JSON.stringify(beforeValue)}, after=${JSON.stringify(afterValue)}`)
      })
    }

    // Enriquecer 'after' - PRESERVAR valores originales del JSON y solo cargar relaciones
    if (logCopy.changes.after && logCopy.changes.after.id) {
      try {
        console.log(`  🔍 Buscando relaciones para after.id: ${logCopy.changes.after.id}`)
        const afterWithRelations = await repository.findOne({
          where: { id: logCopy.changes.after.id } as any,
          relations: relations,
          withDeleted: true,
        })
        if (afterWithRelations) {
          console.log(`  ✅ Relaciones after encontradas`)

          // PRESERVAR los valores originales del JSON y solo agregar las relaciones
          const originalAfter = { ...logCopy.changes.after }
          logCopy.changes.after = {
            ...originalAfter, // Mantener valores históricos del JSON
            ...Object.fromEntries(relations.map(rel => [rel, afterWithRelations[rel]])), // Solo agregar las relaciones cargadas
          }

          // Mostrar valores de campos cambiados DESPUÉS de enriquecer after
          if (logCopy.changedFields && logCopy.changedFields.length > 0) {
            console.log(`  📊 Valores DESPUÉS de enriquecer after (preservando valores originales):`)
            logCopy.changedFields.forEach(field => {
              const beforeValue = logCopy.changes?.before?.[field]
              const afterValue = logCopy.changes?.after?.[field]
              console.log(`    - ${field}: before=${JSON.stringify(beforeValue)}, after=${JSON.stringify(afterValue)}`)
            })
          }

          console.log(
            `  - Después de enriquecer after, before.id: ${logCopy.changes?.before?.id}, after.id: ${logCopy.changes?.after?.id}`,
          )
          console.log(`  - before === after (referencia): ${logCopy.changes?.before === logCopy.changes?.after}`)
        } else {
          console.log(`  ⚠️  No se encontró entidad para after.id: ${logCopy.changes.after.id}`)
        }
      } catch (error) {
        console.error(`  ❌ Error cargando relaciones para after en log ${logCopy.id}:`, error)
      }
    }

    // Enriquecer 'before' - PRESERVAR valores originales del JSON y solo cargar relaciones
    if (logCopy.changes.before && logCopy.changes.before.id) {
      try {
        console.log(`  🔍 Buscando relaciones para before.id: ${logCopy.changes.before.id}`)
        const beforeWithRelations = await repository.findOne({
          where: { id: logCopy.changes.before.id } as any,
          relations: relations,
          withDeleted: true,
        })
        if (beforeWithRelations) {
          console.log(`  ✅ Relaciones before encontradas`)

          // PRESERVAR los valores originales del JSON y solo agregar las relaciones
          const originalBefore = { ...logCopy.changes.before }
          logCopy.changes.before = {
            ...originalBefore, // Mantener valores históricos del JSON
            ...Object.fromEntries(relations.map(rel => [rel, beforeWithRelations[rel]])), // Solo agregar las relaciones cargadas
          }

          // Mostrar valores de campos cambiados DESPUÉS de enriquecer before
          if (logCopy.changedFields && logCopy.changedFields.length > 0) {
            console.log(`  📊 Valores DESPUÉS de enriquecer before (preservando valores originales):`)
            logCopy.changedFields.forEach(field => {
              const beforeValue = logCopy.changes?.before?.[field]
              const afterValue = logCopy.changes?.after?.[field]
              console.log(`    - ${field}: before=${JSON.stringify(beforeValue)}, after=${JSON.stringify(afterValue)}`)
            })
          }

          console.log(
            `  - Después de enriquecer before, before.id: ${logCopy.changes?.before?.id}, after.id: ${logCopy.changes?.after?.id}`,
          )
          console.log(`  - before === after (referencia): ${logCopy.changes?.before === logCopy.changes?.after}`)
        } else {
          console.log(`  ⚠️  No se encontró entidad para before.id: ${logCopy.changes.before.id}`)
        }
      } catch (error) {
        console.error(`  ❌ Error cargando relaciones para before en log ${logCopy.id}:`, error)
      }
    }

    console.log(`  ✅ [enrichLogWithRelations] Log ${logIndex} completado`)
    return logCopy
  }
}
