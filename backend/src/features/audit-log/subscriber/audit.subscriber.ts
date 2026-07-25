import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  InsertEvent,
  RemoveEvent,
} from 'typeorm'
import { Injectable, OnModuleInit } from '@nestjs/common'

/**
 * Automatic EntityBase → audit_log writing is disabled.
 * This Nest app targets the SRS DB, which has no `audit_log` table.
 * Do not re-enable table auditing without an explicit product decision + DDL.
 */
@Injectable()
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface, OnModuleInit {
  onModuleInit() {
    console.log('AuditSubscriber: disabled (no table auditing)')
  }

  listenTo(): Function | string {
    return Object
  }

  async afterUpdate(_event: UpdateEvent<any>): Promise<void> {
    return
  }

  async afterInsert(_event: InsertEvent<any>): Promise<void> {
    return
  }

  async afterRemove(_event: RemoveEvent<any>): Promise<void> {
    return
  }
}
