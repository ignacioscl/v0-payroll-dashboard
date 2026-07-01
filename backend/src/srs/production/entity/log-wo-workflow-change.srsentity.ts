import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: LOG_WO_WORKFLOW_CHANGE.
 * Fuente de verdad de la fecha en que una WO pasó a Done (id_workflow = 7).
 */
@Entity({ name: 'LOG_WO_WORKFLOW_CHANGE', synchronize: false })
export class LogWoWorkflowChange {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_work_order', type: 'int' })
  idWorkOrder!: number

  @Column({ name: 'id_workflow', type: 'int' })
  idWorkflow!: number

  @Column({ name: 'fecha', type: 'datetime', nullable: true })
  fecha?: string
}
