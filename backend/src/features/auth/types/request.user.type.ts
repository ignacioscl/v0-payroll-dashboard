import { Request } from '@nestjs/common'

import { User } from '../../user/entity/user.entity'
import { Company } from '../../company/entity/company.entity'

export type RequestWithUser = Request & { user: User } & { company: Company } & { language: string }
