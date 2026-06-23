import * as bcrypt from 'bcrypt'
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import {
  AfterLoad,
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'

import { EntityBase } from '../../../commons/entity/entity-base'
import { Company } from '../../company/entity/company.entity'
import { Role } from '../../role/entity/role.entity'
import { RoleEnum } from 'src/commons/enum/role.enum'
import { UserExtended } from './user-extended.entity'
import { UserCompanyRel } from '../../user.company.rel/entity/user.company.rel.entity'

@Entity({ name: 'user' })
export class User extends EntityBase {
  @ApiProperty({
    description: 'Username of User',
    required: true,
    default: 'email@user.com',
  })
  @Column({ nullable: false })
  @IsNotEmpty()
  @IsString()
  @IsEmail({}, { message: 'email not valid' })
  email!: string

  @ApiProperty({
    description: 'First name of User',
    required: true,
    example: 'John',
  })
  @Column({ default: '' })
  @IsNotEmpty()
  @IsString()
  firstName!: string

  @ApiProperty({
    description: 'Last name of User',
    required: true,
    example: 'Doe',
  })
  @Column({ default: '' })
  @IsNotEmpty()
  @IsString()
  lastName!: string

  @ApiProperty({
    description: 'Password of User',
    required: true,
    default: 'pwd_user',
  })
  @Column()
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(20)
  //@Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, { message: 'password too weak' })
  @Exclude({ toPlainOnly: true })
  password: string

  @ApiProperty({
    description: 'Role of User',
    required: false,
    default: RoleEnum.USER,
  })
  @Column({ type: 'varchar', name: 'role', default: RoleEnum.USER })
  @IsEnum(RoleEnum)
  @IsNotEmpty()
  role: RoleEnum

  @ApiProperty({
    description: 'Id de la compañía',
    type: Number,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Column({ type: 'int', unsigned: true, nullable: true, name: 'id_company' })
  idCompany?: number

  @ApiProperty({
    description: 'Compañía del usuario',
    type: () => Company,
    required: false,
  })
  @IsOptional()
  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'id_company' })
  company?: Company

  @OneToOne(() => UserExtended, userExtended => userExtended.user)
  userExtended?: UserExtended

  @OneToMany(() => UserCompanyRel, userCompanyRel => userCompanyRel.user)
  @IsOptional()
  userCompanyRels?: UserCompanyRel[]

  @Exclude({ toPlainOnly: true })
  private tempPassword: string

  @Expose()
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`
  }

  @AfterLoad()
  private loadTempPassword(): void {
    this.tempPassword = this.password
  }

  @BeforeInsert()
  private async hashPasswordOnInsert(): Promise<void> {
    this.password = await bcrypt.hash(this.password, 10)
  }

  @BeforeUpdate()
  private async hashPasswordOnUpdate(): Promise<void> {
    if (this.tempPassword !== this.password) {
      this.password = await bcrypt.hash(this.password, 10)
    }
  }
}
