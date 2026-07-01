import { ForbiddenException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

import { BaseService } from '../../../commons/service/base.service'
import { User } from '../entity/user.entity'
import { UserExtended } from '../entity/user-extended.entity'
import {
  UpdateUserDto,
  UserDto,
  UserQueryDto,
  ChangePasswordDto,
  UserPatientDto,
} from '../dto/user.dto'
import { UserRepository } from '../repository/user.repository'
import { RoleEnum } from 'src/commons/enum/role.enum'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { Transactional } from 'typeorm-transactional'
import { EmailService } from '../../../commons/email/service/email.service'
import { I18nError } from 'src/commons/errors/i18n.error'
import { Company } from 'src/features/company/entity/company.entity'
import { UserCompanyRelService } from 'src/features/user.company.rel/service/user.company.rel.service'
import { CompanyService } from 'src/features/company/service/company.service'

@Injectable()
export class UserService extends GlobalBaseService<User, UserQueryDto> {
  constructor(
    @Inject(UserRepository) private readonly repository: UserRepository,
    @InjectRepository(UserExtended) private readonly userExtendedRepository: Repository<UserExtended>,
    @Inject(UserCompanyRelService) private readonly userCompanyRelService: UserCompanyRelService,
    private readonly emailService: EmailService,
  ) {
    super()
  }

  protected getRepository() {
    return this.repository
  }
  @Transactional()
  async createCustomUser(user: UserDto, company: Company) {
    const userDb = await this.findByUsername(user.email)
    if (userDb) throw new I18nError(`error.user.already_exists`, HttpStatus.BAD_REQUEST, [user.email])
    console.log('🏥 User Service - Company:', company)
    if (company && company.parent) {
      user.idCompany = company.parent.id
    } else if (company && company.id) {
      user.idCompany = company.id
    } else {
      user.idCompany = 1
    }

    // Extraer información extendida y foto del empleado
    const { userExtended, userCompanyRels, employeePhoto, ...userData } = user
    /*if (!userCompanyRels || userCompanyRels.length === 0) {
      throw new I18nError(`error.userCompanyRelsRequired`, HttpStatus.BAD_REQUEST)
    }*/

    // Crear usuario
    const createdUser = await this.create(userData)

    /*for (const userCompanyRel of userCompanyRels) {
      userCompanyRel.idUser = createdUser.id!
      await this.userCompanyRelService.assignUserToCompany(userCompanyRel)
    }*/

    // Si hay información extendida, crearla
    if (userExtended) {
      const userExtendedData = {
        ...userExtended,
        id: createdUser.id,
      }
      await this.userExtendedRepository.save(userExtendedData)
    }

    // Si hay foto del empleado, guardarla
    if (employeePhoto && createdUser.id) {
      try {
        this.saveEmployeePhoto(createdUser.id, employeePhoto)
      } catch (error) {
        // Log del error pero no fallar la creación del usuario
        console.error('Error guardando foto del empleado:', error)
      }
    }

    // Enviar email de bienvenida
    try {
      await this.emailService.sendWelcomeEmail(user.email, {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      })
    } catch (error) {
      // Log del error pero no fallar la creación del usuario
      console.error('Error enviando email de bienvenida:', error)
    }

    return await this.getById(createdUser.id!)
  }

  private saveEmployeePhoto(idEmpleado: number, base64Image: string): void {
    try {
      // Decodificar base64
      const base64Data = base64Image.replace(/^data:image\/(\w+);base64,/, '')
      const imageBuffer = Buffer.from(base64Data, 'base64')

      // Detectar extensión desde el base64 original
      const mimeMatch = base64Image.match(/^data:image\/(\w+);base64,/)
      const extension = mimeMatch ? mimeMatch[1] : 'jpg'

      // Crear ruta del directorio
      const uploadDir = join(process.cwd(), 'upload', 'images')

      // Crear directorio si no existe
      mkdirSync(uploadDir, { recursive: true })

      // Nombre del archivo: idEmpleado_employeefoto.{extension}
      const fileName = `${idEmpleado}_employeefoto.${extension}`
      const filePath = join(uploadDir, fileName)

      // Guardar archivo
      writeFileSync(filePath, imageBuffer)
      console.log(`Foto del empleado guardada en: ${filePath}`)
    } catch (error) {
      console.error('Error al guardar foto del empleado:', error)
      throw error
    }
  }

  private deleteEmployeePhoto(idEmpleado: number): void {
    try {
      const uploadDir = join(process.cwd(), 'upload', 'images')
      const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']

      // Buscar y eliminar archivo con cualquier extensión
      for (const ext of extensions) {
        const fileName = `${idEmpleado}_employeefoto.${ext}`
        const filePath = join(uploadDir, fileName)

        if (existsSync(filePath)) {
          unlinkSync(filePath)
          console.log(`Foto del empleado eliminada: ${filePath}`)
          break // Solo eliminar el primer archivo encontrado
        }
      }
    } catch (error) {
      console.error('Error al eliminar foto del empleado:', error)
      // No lanzar error para no interrumpir el flujo
    }
  }

  findByUsername(username: string) {
    return this.getRepository().findByUsername(username)
  }

  findByUsernameWithDeleteAt(username: string) {
    return this.getRepository().findByUsernameWithDeleteAt(username)
  }

  @Transactional()
  async updateCustom(id: number, userDto: UpdateUserDto): Promise<void> {
    // Obtener el usuario actual para validar la compañía
    const currentUser = await this.getById(id)
    if (!currentUser) {
      throw new ForbiddenException(`User with id ${id} not found`)
    }
    //if (id > 0) throw new I18nError(`error.user.already_exists`, HttpStatus.BAD_REQUEST, ['test'])
    // Extraer información extendida, foto del empleado y flag de eliminación
    const { userExtended, userCompanyRels, idCompany, employeePhoto, imageDelete, ...userData } = userDto
    /*if (userCompanyRels && userCompanyRels.length > 0) {
      await this.userCompanyRelService.deleteByUserId(id)
      for (const userCompanyRel of userCompanyRels) {
        userCompanyRel.idUser = id
        await this.userCompanyRelService.assignUserToCompany(userCompanyRel)
      }
    } else {
      throw new I18nError(`error.userCompanyRelsRequired`, HttpStatus.BAD_REQUEST)
    }*/
    // Actualizar usuario
    const updatedUser = await this.updateById(id, userData)

    // Si hay información extendida, actualizarla o crearla
    if (userExtended) {
      const existingExtended = await this.userExtendedRepository.findOne({ where: { id } })

      if (existingExtended) {
        // Actualizar información extendida existente
        await this.userExtendedRepository.update(id, userExtended)
      } else {
        // Crear nueva información extendida
        const userExtendedData = {
          ...userExtended,
          id: id,
        }
        await this.userExtendedRepository.save(userExtendedData)
      }
    }

    // Manejar imagen del empleado
    if (imageDelete === 1) {
      // Eliminar imagen si viene el flag
      try {
        this.deleteEmployeePhoto(id)
      } catch (error) {
        console.error('Error eliminando foto del empleado:', error)
      }
    } else if (employeePhoto) {
      // Si viene nueva imagen, reemplazar/crear
      try {
        // Primero eliminar la imagen anterior si existe
        this.deleteEmployeePhoto(id)
        // Luego guardar la nueva
        this.saveEmployeePhoto(id, employeePhoto)
      } catch (error) {
        console.error('Error guardando foto del empleado:', error)
      }
    }
    // Si no viene ni imageDelete ni employeePhoto, no hacer nada
  }

  /*async deleteUser(id: number, user: User) {
    if (user.id! === id) throw new ForbiddenException('Cannot delete your own user')
    return this.deleteOrFail(id)
  }*/

  async findWithFiltersAndPagination(payload: UserQueryDto, user: User) {
    return this.getRepository().fetch(payload)
  }
  async findWithFiltersAndPaginationPatients(payload: UserQueryDto, user: User) {
    payload.role = RoleEnum.PATIENT
    return this.getRepository().fetch(payload)
  }

  /**
   * Método público para obtener usuarios con información completa (incluyendo valores de pago)
   * No requiere el parámetro User ya que es para uso interno entre servicios
   */
  async fetchUsers(payload: UserQueryDto) {
    return this.getRepository().fetch(payload)
  }

  @Transactional()
  async changePassword(id: number, changePasswordDto: ChangePasswordDto): Promise<void> {
    // Verificar que el usuario existe
    const user = await this.getById(id)
    if (!user) {
      throw new ForbiddenException(`User with id ${id} not found`)
    }

    // Verificar que las contraseñas coinciden (ya validado por el DTO)
    if (changePasswordDto.password !== changePasswordDto.confirmPassword) {
      throw new ForbiddenException('Las contraseñas no coinciden')
    }

    // Actualizar solo la contraseña
    await this.updateById(id, { password: changePasswordDto.password })
  }

  async getUserCompanies(userId: number) {
    return this.repository.getUserCompanies(userId)
  }
  getByIdCustom(id: number) {
    return this.getRepository().getById(id)
  }

  async getEmployeePhoto(idEmpleado: number): Promise<Buffer | null> {
    try {
      const uploadDir = join(process.cwd(), 'upload', 'images')

      // Extensiones comunes a buscar
      const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']

      // Buscar archivo con cualquier extensión
      for (const ext of extensions) {
        const fileName = `${idEmpleado}_employeefoto.${ext}`
        const filePath = join(uploadDir, fileName)

        if (existsSync(filePath)) {
          return readFileSync(filePath)
        }
      }

      // Si no se encuentra ningún archivo, retornar null
      return null
    } catch (error) {
      console.error('Error al obtener foto del empleado:', error)
      return null
    }
  }
}
