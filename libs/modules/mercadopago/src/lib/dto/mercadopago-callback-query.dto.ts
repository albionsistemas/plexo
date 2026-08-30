import { IsOptional, IsString } from 'class-validator';

/**
 * Query params MP appends to MP_OAUTH_REDIRECT_URI. `code`/`state` are
 * present on a successful consent; `error` (e.g. "access_denied") is
 * present instead when the seller declines - both are optional here so
 * validation itself doesn't reject the denial case before the controller
 * gets a chance to redirect the user back with a clear status.
 */
export class MercadoPagoCallbackQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  error?: string;
}
