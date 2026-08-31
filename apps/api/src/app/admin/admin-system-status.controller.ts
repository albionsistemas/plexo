import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { AdminSystemStatusService } from './admin-system-status.service.js';

@Controller('admin/system-status')
@UseGuards(PlatformAdminGuard)
export class AdminSystemStatusController {
  constructor(private readonly adminSystemStatusService: AdminSystemStatusService) {}

  @Get()
  getStatus() {
    return this.adminSystemStatusService.getStatus();
  }
}
