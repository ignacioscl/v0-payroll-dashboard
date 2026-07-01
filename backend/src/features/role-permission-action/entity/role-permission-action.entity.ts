import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsNumber, IsOptional } from 'class-validator'
import { Column, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { Role } from '../../role/entity/role.entity'
import { PermissionAction } from '../../permission-action/entity/permission-action.entity'

@Entity({ name: 'role_permission_action' })
export class RolePermissionAction {
  @ApiProperty({
    description: 'Id',
    type: Number,
  })
  @PrimaryGeneratedColumn()
  @IsInt()
  @IsOptional()
  id?: number

  @ApiProperty({
    description: 'Role ID',
    type: Number,
  })
  @IsNumber()
  @Column({ name: 'id_role' })
  idRole: number

  @ApiProperty({
    description: 'Permission Action ID',
    type: Number,
  })
  @IsNumber()
  @Column({ name: 'id_permission_action' })
  idPermissionAction: number

  // Relations
  @ManyToOne(() => Role)
  @JoinColumn({ name: 'id_role' })
  role?: Role

  @ManyToOne(() => PermissionAction)
  @JoinColumn({ name: 'id_permission_action' })
  permissionAction?: PermissionAction
}
