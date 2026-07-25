import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsNotEmpty } from 'class-validator'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** Legacy SRS: ROL_ACCION_REL — shares CRUD with srs-rol. */
@Entity({ name: 'ROL_ACCION_REL', synchronize: false })
export class RolAccionRel extends SrsEntityBase {
  @ApiProperty()
  @PrimaryGeneratedColumn({ name: 'id' })
  @IsInt()
  id!: number

  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  @Column({ name: 'id_rol', type: 'int' })
  idRol!: number

  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  @Column({ name: 'id_rol_accion', type: 'int' })
  idRolAccion!: number
}
