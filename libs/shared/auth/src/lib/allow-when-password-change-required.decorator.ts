import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED_KEY = 'allowWhenPasswordChangeRequired';

/** Exempts a route from MustChangePasswordGuard - only auth.controller's
 * getMe (so the frontend can read the flag) and changePassword (so it can
 * actually be resolved) need this. Everything else stays blocked for a
 * user with mustChangePassword=true until they change it. */
export const AllowWhenPasswordChangeRequired = () =>
  SetMetadata(ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED_KEY, true);
