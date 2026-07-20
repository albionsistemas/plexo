import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Exempts a route from JwtAuthGuard (e.g. login, health checks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
