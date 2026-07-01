import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

import { RoleEnum } from '../../../commons/enum/role.enum'
import { JwtToken } from '../../../commons/enum/auth.enum'
import { User } from '../../user/entity/user.entity'
import { AuthUtils } from '../../../commons/utils/auth.utils'
import { UserService } from '../../user/service/user.service'
import { CompanyService } from '../../company/service/company.service'
import { RequestWithUser } from '../types/request.user.type'

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly companyService: CompanyService,
    private readonly authUtils: AuthUtils,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userService.findByUsername(username)
    const passwordMatch = await this.authUtils.comparePassword(password, user?.password || '')
    console.log('passwordMatch', passwordMatch)
    console.log('user', user)
    if (user && passwordMatch) {
      return user
    }
    return null
  }

  async login({ id, role, email, firstName, lastName }: User) {
    //TODO: dejar log de ultima login
    //this.setLastActive(username)
    const [token, refreshToken] = await this.generateTokens(email, role, id!)
    return {
      user: {
        id,
        email,
        firstName,
        lastName,
        role,
      },
      token,
      refreshToken,
    }
  }

  private generateTokens(username: string, role: RoleEnum, sub: number) {
    const tokenPayload = { username, sub, role, type: JwtToken.SESSION_TOKEN }
    const refreshTokenPayload = { username, sub, role, type: JwtToken.REFRESH_TOKEN }
    const tokenPromise = this.jwtService.signAsync(tokenPayload, {
      expiresIn: this.configService.get<string>('tokenExpiresIn'),
    })
    const refreshTokenPromise = this.jwtService.signAsync(refreshTokenPayload, {
      expiresIn: this.configService.get<string>('refreshExpiresIn'),
    })

    return Promise.all([tokenPromise, refreshTokenPromise])
  }

  private async setLastActive(username: string) {
    const user = await this.userService.findByUsername(username)
    //user!.lastActiveAt = new Date()
    return this.userService.updateCustom(user!.id!, user!)
  }

  async getUserCompanies(user: User) {
    if (user.role === RoleEnum.ADMIN) {
      // Si es ADMIN, devolver todas las compañías
      const allCompanies = await this.companyService.fetch({})
      return {
        companies: allCompanies.data.map(company => ({
          id: company.id,
          companyName: company.companyName,
          roleName: 'ADMIN', // Los admins tienen acceso total
          isDefault: 1,
          parent: company.parent ? { id: company.parent.id, companyName: company.parent.companyName } : null,
        })),
      }
    }

    // Si no es ADMIN, devolver solo las compañías asignadas
    const userCompanies = await this.userService.getUserCompanies(user.id!)

    return {
      companies: userCompanies.map(rel => ({
        id: rel.companyId,
        companyName: rel.companyName,
        roleName: rel.roleName,
        isDefault: rel.isDefault,
        parent: rel.parentId ? { id: rel.parentId, companyName: rel.parentCompanyName } : null,
      })),
    }
  }
}
