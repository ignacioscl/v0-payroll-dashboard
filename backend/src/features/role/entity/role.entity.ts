import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { Company } from '../../company/entity/company.entity'

@Entity({ name: 'role' })
export class Role extends EntityBase {
  @ApiProperty({
    description: 'ID de la compañía',
    type: Number,
    required: true,
    example: 1,
  })
  @Column({ type: 'int', unsigned: true, nullable: false })
  @IsNotEmpty()
  idCompany!: number

  @ApiProperty({
    description: 'Nombre del rol',
    type: String,
    required: true,
    maxLength: 45,
    example: 'ADMIN',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(45)
  @Column({ length: 45, nullable: false })
  roleName!: string

  @ManyToOne(() => Company, company => company.id)
  @JoinColumn({ name: 'id_company' })
  company?: Company
}
