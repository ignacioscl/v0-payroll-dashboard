import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: WORKFLOW. Estados de una WO.
 * Constantes: Waiting=5, In Process=6, Done=7, In Transit=15, Pause=16.
 */
@Entity({ name: 'WORKFLOW', synchronize: false })
export class Workflow {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'descripcion', type: 'varchar', length: 255, nullable: true })
  descripcion?: string

  @Column({ name: 'ordenamiento', type: 'int', nullable: true })
  ordenamiento?: number
}

/** IDs de workflow usados por los KPIs. */
export enum WorkflowStatus {
  WAITING = 5,
  IN_PROCESS = 6,
  DONE = 7,
  IN_TRANSIT = 15,
  PAUSE = 16,
}

/** Estados "abiertos" (open backlog / pipeline). */
export const OPEN_WORKFLOW_STATUSES = [
  WorkflowStatus.WAITING,
  WorkflowStatus.IN_PROCESS,
  WorkflowStatus.IN_TRANSIT,
  WorkflowStatus.PAUSE,
]
