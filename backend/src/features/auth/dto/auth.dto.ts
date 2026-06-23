import { ApiProperty, PickType } from '@nestjs/swagger'

import { UserDto } from '../../user/dto/user.dto'

export class AuthDto extends PickType(UserDto, ['password', 'firstName', 'lastName']) {}

export class UserSessionDto {
  @ApiProperty({
    description: `User's ID`,
    type: Number,
  })
  id: number
  @ApiProperty({
    description: `User's username`,
    type: String,
  })
  username: string
  @ApiProperty({
    description: `User's role`,
    type: String,
  })
  role: string
}

export class SessionDto {
  @ApiProperty({
    description: `User session info`,
    type: UserSessionDto,
  })
  user: UserSessionDto
  @ApiProperty({
    description: `Session token`,
    type: String,
  })
  token: string
  @ApiProperty({
    description: `Refresh token`,
    type: String,
  })
  refreshToken: string
}
