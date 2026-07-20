import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@plexo/types';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles. Routes without this decorator are
 * allowed through RolesGuard unchecked — it's opt-in per route, not a
 * default-deny.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
