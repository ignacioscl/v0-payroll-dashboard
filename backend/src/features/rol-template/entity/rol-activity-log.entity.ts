import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import { Column, Entity } from 'typeorm'

import { EntityBase } from 'src/commons/entity/entity-base'

/** Mirrors MySQL ENUM on `ROL_ACTIVITY_LOG.action`. */
export enum RolActivityLogAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  ACTIVATE = 'activate',
  INACTIVATE = 'inactivate',
  SET_PERMISSIONS = 'set_permissions',
  CREATE_ROLES = 'create_roles',
  DELETE_ROLE = 'delete_role',
  SET_ROLE_ESTADO = 'set_role_estado',
}

/** Activity log for ROL_TEMPLATE and standalone ROL (who / what / when). */
@Entity({ name: 'ROL_ACTIVITY_LOG', synchronize: false })
export class RolActivityLog extends EntityBase {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_rol_template', type: 'int', nullable: true })
  idRolTemplate?: number | null

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_rol', type: 'int', nullable: true })
  idRol?: number | null

  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  @Column({ name: 'id_author', type: 'int' })
  idAuthor!: number

  @ApiProperty({ enum: RolActivityLogAction })
  @IsEnum(RolActivityLogAction)
  @IsNotEmpty()
  @Column({
    name: 'action',
    type: 'enum',
    enum: RolActivityLogAction,
  })
  action!: RolActivityLogAction

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Column({ name: 'summary', type: 'varchar', length: 512 })
  summary!: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @IsOptional()
  @IsObject()
  @Column({ name: 'detail_json', type: 'json', nullable: true })
  detailJson?: Record<string, unknown> | null
}
