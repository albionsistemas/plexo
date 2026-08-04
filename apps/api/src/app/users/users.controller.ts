import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { InviteUserDto } from './dto/invite-user.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('OWNER', 'ADMIN')
  @Post()
  invite(@Body() dto: InviteUserDto) {
    return this.usersService.inviteUser(dto);
  }
}
