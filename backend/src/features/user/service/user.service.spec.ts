import { Test, TestingModule } from '@nestjs/testing'
import { DeepPartial } from 'typeorm'

import { repoMock } from '../../../commons/test'
import { User } from '../entity/user.entity'
import { UserRepository } from '../repository/user.repository'
import { UserService } from './user.service'

const userArray = [
  { id: 1, username: 'user', password: 'user', deletedAt: null, createdAt: null },
  { id: 2, username: 'user2', password: 'user2', deletedAt: null, createdAt: null },
  { id: 3, username: 'user3', password: 'user3', deletedAt: null, createdAt: null },
]

const oneUser = { id: 1, username: 'user', password: 'user', deletedAt: null, createdAt: null }

const userDto: DeepPartial<User> = {
  password: 'user',
  email: 'user',
}

const idUser = 1

describe('UserService', () => {
  let service: UserService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          // define all the methods that you use from the catRepo
          // give proper return values as expected or mock implementations, your choice
          useValue: repoMock(userArray, oneUser),
        },
      ],
    }).compile()

    service = module.get<UserService>(UserService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should return an array of users', async () => {
    const users = await service.findAll()
    expect(users).toEqual(userArray)
  })

  it('should get a single user', async () => {
    const findId = await service.findById(0)
    expect(findId).toEqual(oneUser)
  })

  it('should call the update method', async () => {
    const result = await service.updateById(idUser, userDto)
    expect(result).toBe(undefined)
  })

  it('should return {deleted: true}', async () => {
    const result = await service.deleteHard(1)
    expect(result).toEqual(true)
  })
})
