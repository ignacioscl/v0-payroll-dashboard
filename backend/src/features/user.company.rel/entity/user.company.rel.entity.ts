import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator'
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

import { User } from '../../user/entity/user.entity'
import { Company } from '../../company/entity/company.entity'
import { Role } from '../../role/entity/role.entity'

@Entity('user_company_rel')
export class UserCompanyRel {
  @PrimaryGeneratedColumn()
  @IsOptional()
  @IsNumber()
  id?: number

  @ApiProperty({
    description: 'ID del usuario',
    type: Number,
    required: true,
    example: 1,
  })
  @Column({ type: 'int', unsigned: true, nullable: false, name: 'id_user' })
  @IsNotEmpty()
  @IsNumber()
  idUser!: number

  @ApiProperty({
    description: 'ID de la compañía',
    type: Number,
    required: true,
    example: 1,
  })
  @Column({ type: 'int', unsigned: true, nullable: false, name: 'id_company' })
  @IsNotEmpty()
  @IsNumber()
  idCompany!: number

  @ApiProperty({
    description: 'ID del rol en esta compañía',
    type: Number,
    required: true,
    example: 1,
  })
  @Column({ type: 'int', unsigned: true, nullable: false, name: 'id_role' })
  @IsNotEmpty()
  @IsNumber()
  idRole!: number

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_user' })
  user?: User

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'id_company' })
  company?: Company

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'id_role' })
  role?: Role

  @ApiProperty({
    description: 'Fecha de creación',
    type: Date,
    required: false,
  })
  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date

  @ApiProperty({
    description: 'Indica si es la compañía por defecto',
    type: Number,
    enum: [0, 1],
    required: false,
  })
  @Column({ type: 'tinyint', unsigned: true, nullable: false, name: 'is_default', default: 0 })
  isDefault!: 0 | 1
}
