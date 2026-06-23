import { Test, TestingModule } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

import { AuthUtils } from '../../../../commons/utils/auth.utils'
import { UserService } from '../../../user/service/user.service'
import { AuthService } from './auth.service'
import { repoMock } from '../../../../commons/test'
import { UserRepository } from '../../../user/repository/user.repository'

describe('AuthService', () => {
  let service: AuthService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        UserService,
        JwtService,
        AuthUtils,
        ConfigService,
        {
          provide: UserRepository,
          useValue: repoMock([], {}),
        },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
  })
  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
