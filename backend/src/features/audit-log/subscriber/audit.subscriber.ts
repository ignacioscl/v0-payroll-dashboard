import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  InsertEvent,
  RemoveEvent,
  DataSource,
  EntityMetadata,
} from 'typeorm'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { AuditService, AuditLogData } from '../service/audit.service'
import { AuditContextService } from '../service/audit-context.service'
import { AuditAction } from '../entity/audit-log.entity'
import { EntityBase } from '../../../commons/entity/entity-base'

@Injectable()
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface, OnModuleInit {
  private readonly tableNameMap = new Map<Function, string>()

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly auditContextService: AuditContextService,
  ) {}

  onModuleInit() {
    console.log('🔍 AuditSubscriber: Inicializando...')

    // Registrar las entidades para el mapa
    this.registerEntities()
    console.log(`🔍 AuditSubscriber: Registradas ${this.tableNameMap.size} entidades auditable`)

    // Listar las entidades registradas
    this.tableNameMap.forEach((tableName, entityClass) => {
      console.log(`  - ${tableName} (${entityClass.name})`)
    })

    // Crear y registrar un subscriber para cada entidad
    const entities = this.dataSource.entityMetadatas
    let registeredCount = 0
    entities.forEach(metadata => {
      if (typeof metadata.target === 'function' && this.isEntityBase(metadata.target)) {
        const subscriber = this.createSubscriberForEntity(metadata.target)
        this.dataSource.subscribers.push(subscriber)
        registeredCount++
        console.log(`🔍 AuditSubscriber: Registrado subscriber para ${metadata.tableName}`)
      }
    })
    console.log(`✅ AuditSubscriber: ${registeredCount} subscribers dinámicos registrados`)
  }

  private createSubscriberForEntity(entityClass: Function): EntitySubscriberInterface {
    const self = this
    return {
      listenTo: () => entityClass,
      afterUpdate: async (event: UpdateEvent<any>) => {
        console.log(`🔍 DynamicSubscriber: afterUpdate para ${entityClass.name}`)
        return self.afterUpdate(event)
      },
      afterInsert: async (event: InsertEvent<any>) => {
        console.log(`🔍 DynamicSubscriber: afterInsert para ${entityClass.name}`)
        return self.afterInsert(event)
      },
      afterRemove: async (event: RemoveEvent<any>) => {
        console.log(`🔍 DynamicSubscriber: afterRemove para ${entityClass.name}`)
        return self.afterRemove(event)
      },
    } as EntitySubscriberInterface
  }

  private registerEntities() {
    const entities = this.dataSource.entityMetadatas
    entities.forEach(metadata => {
      // Ignorar audit_log para evitar recursión infinita
      if (metadata.tableName === 'audit_log') {
        console.log(`⚠️ AuditSubscriber: Ignorando ${metadata.tableName} para evitar recursión`)
        return
      }

      if (typeof metadata.target === 'function' && this.isEntityBase(metadata.target)) {
        this.tableNameMap.set(metadata.target, metadata.tableName)
      }
    })
  }

  // TypeORM requiere que listenTo() retorne una entidad específica
  // Retornamos la primera entidad del mapa, pero los métodos after* filtrarán todas las entidades
  listenTo(): Function | string {
    const firstEntity = Array.from(this.tableNameMap.keys())[0]
    if (firstEntity) {
      console.log(`🔍 AuditSubscriber: listenTo() retorna ${firstEntity.name}`)
      return firstEntity
    }
    console.log('⚠️ AuditSubscriber: No hay entidades en el mapa, retornando Object')
    return Object
  }

  async afterUpdate(event: UpdateEvent<any>) {
    try {
      console.log('🔍 AuditSubscriber: afterUpdate llamado', {
        entity: event.entity?.id,
        table: event.metadata?.tableName,
      })

      if (!event.entity || !event.metadata) {
        console.log('⚠️ AuditSubscriber: afterUpdate - sin entity o metadata')
        return
      }

      const tableName = event.metadata.tableName
      if (!this.tableNameMap.has(event.metadata.target as Function)) {
        console.log(`⚠️ AuditSubscriber: ${tableName} no está en el mapa de entidades auditable`)
        return
      }

      // IMPORTANTE: event.databaseEntity tiene el estado ANTES del UPDATE
      // event.entity tiene el estado DESPUÉS del UPDATE
      // NO debemos recargar desde la BD porque ya estaría actualizado

      const before = event.databaseEntity
      const after = event.entity

      if (!before) {
        console.log('⚠️ AuditSubscriber: No hay databaseEntity, intentando obtener estado anterior')
        const beforeFromDb = await this.getEntityBeforeUpdate(event)
        if (!beforeFromDb) {
          console.log('⚠️ AuditSubscriber: No se pudo obtener estado anterior')
          return
        }
        // Cargar relaciones solo para before (desde BD antes del update)
        const enrichedBefore = await this.loadRelations(event.metadata, beforeFromDb)
        // Para after, usar event.entity directamente (ya tiene los datos actualizados)
        const enrichedAfter = await this.loadRelations(event.metadata, after)

        const changes = this.calculateChanges(enrichedBefore, enrichedAfter)
        console.log('🔍 AuditSubscriber: changes detectados', changes)

        if (changes.length === 0) {
          console.log('⚠️ AuditSubscriber: No hay cambios detectados')
          return
        }

        const context = this.auditContextService.getContext()
        console.log('🔍 AuditSubscriber: Contexto', { userId: context?.userId, ipAddress: context?.ipAddress })

        const auditData: AuditLogData = {
          tableName,
          recordId: after.id,
          action: AuditAction.UPDATE,
          changes: {
            before: this.sanitizeEntity(enrichedBefore),
            after: this.sanitizeEntity(enrichedAfter),
          },
          changedFields: changes,
          userId: context?.userId,
          ipAddress: context?.ipAddress,
        }

        console.log('💾 AuditSubscriber: Guardando log de auditoría', {
          tableName,
          recordId: after.id,
          changes: changes.length,
        })
        await this.auditService.log(auditData)
        console.log('✅ AuditSubscriber: Log guardado exitosamente')
        return
      }

      // Si tenemos databaseEntity, usarlo directamente (ya tiene el estado antes)
      // PRIMERO comparar los cambios ANTES de cargar relaciones
      const changes = this.calculateChanges(before, after)
      console.log('🔍 AuditSubscriber: changes detectados (sin relaciones)', changes)

      if (changes.length === 0) {
        console.log('⚠️ AuditSubscriber: No hay cambios detectados')
        return
      }

      // Para el log final, usar los valores directamente SIN recargar desde la BD
      // event.databaseEntity = estado ANTES del UPDATE
      // event.entity = estado DESPUÉS del UPDATE
      const enrichedBefore = before
      const enrichedAfter = after

      const context = this.auditContextService.getContext()
      console.log('🔍 AuditSubscriber: Contexto', { userId: context?.userId, ipAddress: context?.ipAddress })

      const auditData: AuditLogData = {
        tableName,
        recordId: after.id,
        action: AuditAction.UPDATE,
        changes: {
          before: this.sanitizeEntity(enrichedBefore),
          after: this.sanitizeEntity(enrichedAfter),
        },
        changedFields: changes,
        userId: context?.userId,
        ipAddress: context?.ipAddress,
      }

      console.log('💾 AuditSubscriber: Guardando log de auditoría', {
        tableName,
        recordId: after.id,
        changes: changes.length,
      })
      await this.auditService.log(auditData)
      console.log('✅ AuditSubscriber: Log guardado exitosamente')
    } catch (error) {
      console.error('❌ AuditSubscriber: Error en afterUpdate', error)
    }
  }

  async afterInsert(event: InsertEvent<any>) {
    if (!event.entity || !event.metadata) return

    const tableName = event.metadata.tableName
    if (!this.tableNameMap.has(event.metadata.target as Function)) return

    const enrichedAfter = await this.loadRelations(event.metadata, event.entity)
    const context = this.auditContextService.getContext()

    const auditData: AuditLogData = {
      tableName,
      recordId: event.entity.id,
      action: AuditAction.CREATE,
      changes: {
        before: null,
        after: this.sanitizeEntity(enrichedAfter),
      },
      changedFields: Object.keys(event.entity).filter(k => k !== 'id'),
      userId: context?.userId,
      ipAddress: context?.ipAddress,
    }

    await this.auditService.log(auditData)
  }

  async afterRemove(event: RemoveEvent<any>) {
    if (!event.entity || !event.metadata) return

    const tableName = event.metadata.tableName
    if (!this.tableNameMap.has(event.metadata.target as Function)) return

    const enrichedBefore = await this.loadRelations(event.metadata, event.entity)
    const context = this.auditContextService.getContext()

    const auditData: AuditLogData = {
      tableName,
      recordId: event.entity.id,
      action: AuditAction.DELETE,
      changes: {
        before: this.sanitizeEntity(enrichedBefore),
        after: null,
      },
      changedFields: [],
      userId: context?.userId,
      ipAddress: context?.ipAddress,
    }

    await this.auditService.log(auditData)
  }

  /**
   * Carga todas las relaciones de la entidad usando los metadatos de TypeORM
   * Esto replica exactamente cómo TypeORM devuelve los datos con joins
   */
  private async loadRelations(metadata: EntityMetadata, entity: any): Promise<any> {
    if (!entity || !entity.id) return entity

    try {
      const repository = this.dataSource.getRepository(metadata.target)

      // Obtener todas las relaciones definidas en la entidad
      const relations = metadata.relations.map(rel => rel.propertyName)

      if (relations.length === 0) return entity

      // Cargar la entidad con todas sus relaciones (igual que leftJoinAndSelect)
      const entityWithRelations = await repository.findOne({
        where: { id: entity.id } as any,
        relations: relations,
        withDeleted: true, // Incluir eliminados para auditoría completa
      })

      if (!entityWithRelations) return entity

      // Combinar los datos originales con las relaciones cargadas
      // Esto asegura que tengamos todos los campos, incluso los que no están en relations
      return {
        ...entity,
        ...entityWithRelations,
      }
    } catch (error) {
      console.error(`Error cargando relaciones para ${metadata.tableName}:`, error)
      return entity
    }
  }

  private async getEntityBeforeUpdate(event: UpdateEvent<any>): Promise<any> {
    if (event.databaseEntity) {
      return event.databaseEntity
    }

    if (!event.entity?.id) {
      return null
    }

    try {
      const repository = event.manager.getRepository(event.metadata.target)
      const relations = event.metadata.relations.map(rel => rel.propertyName)

      return await repository.findOne({
        where: { id: event.entity.id } as any,
        relations: relations,
        withDeleted: true,
      })
    } catch (error) {
      console.error('Error obteniendo entidad anterior:', error)
      return null
    }
  }

  private calculateChanges(before: any, after: any): string[] {
    if (!before || !after) return []

    const changes: string[] = []
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

    for (const key of allKeys) {
      // Ignorar campos de auditoría y timestamps automáticos
      if (['updatedAt', 'createdAt', 'deletedAt'].includes(key)) continue

      const beforeValue = before[key]
      const afterValue = after[key]

      // Normalizar valores para comparación
      const normalizedBefore = this.normalizeValue(beforeValue)
      const normalizedAfter = this.normalizeValue(afterValue)

      // Comparar valores normalizados
      if (JSON.stringify(normalizedBefore) !== JSON.stringify(normalizedAfter)) {
        changes.push(key)
      }
    }

    return changes
  }

  private normalizeValue(value: any): any {
    if (value === null || value === undefined) return null

    // Normalizar fechas a string ISO
    if (value instanceof Date) {
      return value.toISOString()
    }

    // Normalizar strings de fecha a ISO
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString()
        }
      } catch (e) {
        // Si falla, devolver el valor original
      }
    }

    // Normalizar booleanos
    if (typeof value === 'boolean') return value
    if (value === 1 || value === '1' || value === 'true') return true
    if (value === 0 || value === '0' || value === 'false') return false

    // Normalizar números
    if (typeof value === 'number') return value
    if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
      return Number(value)
    }

    return value
  }

  private sanitizeEntity(entity: any): any {
    if (!entity) return null

    // Remover campos sensibles
    const { password, ...sanitized } = entity

    // Limpiar recursivamente objetos anidados (relaciones)
    return this.deepSanitize(sanitized)
  }

  private deepSanitize(obj: any): any {
    if (obj === null || obj === undefined) return obj

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitize(item))
    }

    if (typeof obj === 'object' && !(obj instanceof Date)) {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'password') continue
        sanitized[key] = this.deepSanitize(value)
      }
      return sanitized
    }

    return obj
  }

  private isEntityBase(target: Function): boolean {
    let proto = target.prototype
    while (proto) {
      if (proto.constructor === EntityBase) {
        return true
      }
      proto = Object.getPrototypeOf(proto)
      if (!proto || proto === Object.prototype) break
    }
    return false
  }
}
