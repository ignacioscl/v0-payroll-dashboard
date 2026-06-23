import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsEnum, IsNumber, IsOptional, IsObject, IsArray } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'

import { User } from 'src/features/user/entity/user.entity'

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

@Entity({ name: 'audit_log' })
export class AuditLog {
  @ApiProperty({
    description: 'ID del log',
    type: Number,
    required: true,
    example: 1,
  })
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number

  @ApiProperty({
    description: 'Nombre de la tabla modificada',
    type: String,
    required: true,
    example: 'module_route',
  })
  @IsString()
  @IsNotEmpty()
  @Column({ type: 'varchar', length: 100, nullable: false, name: 'table_name' })
  @Index('idx_table_record')
  tableName!: string

  @ApiProperty({
    description: 'ID del registro modificado',
    type: Number,
    required: true,
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  @Column({ type: 'int', unsigned: true, nullable: false, name: 'record_id' })
  @Index('idx_table_record')
  recordId!: number

  @ApiProperty({
    description: 'Acción realizada',
    enum: AuditAction,
    required: true,
    example: AuditAction.UPDATE,
  })
  @IsEnum(AuditAction)
  @IsNotEmpty()
  @Column({
    type: 'enum',
    enum: AuditAction,
    nullable: false,
    name: 'action',
  })
  @Index('idx_action')
  action!: AuditAction

  @ApiProperty({
    description: 'JSON con estado antes y después',
    type: Object,
    required: true,
    example: { before: {}, after: {} },
  })
  @IsObject()
  @IsNotEmpty()
  @Column({ type: 'json', nullable: false, name: 'changes' })
  changes!: {
    before: any | null
    after: any | null
  }

  @ApiProperty({
    description: 'Array de campos modificados',
    type: Array,
    required: true,
    example: ['idDealerProvider', 'estado'],
  })
  @IsArray()
  @IsNotEmpty()
  @Column({ type: 'json', nullable: false, name: 'changed_fields' })
  changedFields!: string[]

  @ApiProperty({
    description: 'ID del usuario que realizó la acción',
    type: Number,
    required: false,
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Column({ type: 'int', unsigned: true, nullable: true, name: 'user_id' })
  @Index('idx_user')
  userId?: number

  @ApiProperty({
    description: 'Dirección IP del usuario',
    type: String,
    required: false,
    example: '192.168.1.1',
  })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
  ipAddress?: string

  @ApiProperty({
    description: 'Fecha y hora del cambio',
    type: Date,
    required: true,
  })
  @CreateDateColumn({ type: 'datetime', nullable: false, name: 'created_at' })
  @Index('idx_created_at')
  createdAt!: Date

  // Relación con User (opcional)
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User
}
