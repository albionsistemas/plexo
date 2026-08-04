import { Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { InviteUserDto } from './dto/invite-user.dto.js';

export interface InvitedUser {
  id: string;
  email: string;
  tempPassword: string;
}

/**
 * Invitar un segundo/tercer/etc. usuario al propio tenant - a diferencia de
 * AdminTenantsService (que crea un tenant nuevo), esto corre dentro del
 * contexto tenant-scoped normal (getTenantDb()), el mismo que ya abrió
 * TenantContextInterceptor para este request. Vive en apps/api en vez de
 * una lib porque, igual que AuthService, está atado a bcrypt/User de una
 * forma que no encaja en el patrón "lib de negocio" del resto del código.
 */
@Injectable()
export class UsersService {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async inviteUser(dto: InviteUserDto): Promise<InvitedUser> {
    await this.subscriptionService.assertCanAddUser();

    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await getTenantDb().user.create({
      data: {
        tenantId: getTenantId(),
        email: dto.email,
        name: dto.name,
        role: dto.role,
        passwordHash,
        mustChangePassword: true,
      },
    });

    return { id: user.id, email: user.email, tempPassword };
  }
}
