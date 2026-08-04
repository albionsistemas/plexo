import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { CreatePlanDto } from './dto/create-plan.dto.js';
import { UpdatePlanDto } from './dto/update-plan.dto.js';
import { SubscriptionService } from './subscription.service.js';

// Cross-tenant (opera sobre el catálogo global de Plan, no sobre el tenant
// del caller) - por eso PlatformAdminGuard en vez de @Roles, y por eso
// deliberadamente sin @AuditEntity (ese log es por-tenant, ver
// ActivityLogInterceptor, y esto no pertenece a ningún tenant).
@Controller('admin/plans')
@UseGuards(PlatformAdminGuard)
export class AdminPlansController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  listAll() {
    return this.subscriptionService.listAllPlans();
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.subscriptionService.createPlan(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.subscriptionService.updatePlan(id, dto);
  }
}
