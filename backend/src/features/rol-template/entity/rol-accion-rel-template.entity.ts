import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsNotEmpty } from 'class-validator'
import { Column, Entity } from 'typeorm'

import { EntityBase } from 'src/commons/entity/entity-base'

/** ROL_ACCION_REL_TEMPLATE — shares CRUD with rol-template. */
@Entity({ name: 'ROL_ACCION_REL_TEMPLATE', synchronize: false })
export class RolAccionRelTemplate extends EntityBase {
  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  @Column({ name: 'id_rol_template', type: 'int' })
  idRolTemplate!: number

  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  @Column({ name: 'id_rol_accion', type: 'int' })
  idRolAccion!: number
}
