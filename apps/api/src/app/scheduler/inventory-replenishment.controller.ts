import { Controller, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { InventoryReplenishmentSchedulerService } from './inventory-replenishment-scheduler.service.js';

// Mismo criterio que RemindersController: disparar la reposición
// automática a mano es una acción de gestión, no algo que cualquier
// usuario de INVENTORY deba poder gatillar libremente.
const WRITE_ROLES = ['OWNER', 'ADMIN'] as const;

@Controller('inventory/replenishment')
export class InventoryReplenishmentController {
  constructor(private readonly schedulerService: InventoryReplenishmentSchedulerService) {}

  @Roles(...WRITE_ROLES)
  @Post('run-now')
  runNow() {
    return this.schedulerService.runAutoReplenishmentForCurrentTenant();
  }
}
