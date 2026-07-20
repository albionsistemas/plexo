import { SetMetadata } from '@nestjs/common';

export interface RequiredModuleAccess {
  module: string;
  level: 'read' | 'write';
}

export const MODULE_ACCESS_KEY = 'moduleAccess';

/**
 * Restricts a route to users with an explicit grant for `module`, unless
 * they're OWNER/ADMIN (who always pass, see ModuleAccessGuard). This is how
 * an ACCOUNTANT user gets read/write on "accounting"/"taxes" without seeing
 * anything else.
 */
export const RequireModuleAccess = (
  module: string,
  level: RequiredModuleAccess['level'] = 'read',
) => SetMetadata(MODULE_ACCESS_KEY, { module, level } satisfies RequiredModuleAccess);
