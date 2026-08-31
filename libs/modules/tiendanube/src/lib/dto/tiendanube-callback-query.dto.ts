import { IsOptional, IsString } from 'class-validator';

/**
 * Query params Tiendanube appends to the configured redirect URL after the
 * merchant grants access: `code` (the authorization code) and `state`
 * (echoed back verbatim from what we sent it, see TiendanubeConfigService.
 * authorizeUrl). Both optional here so validation itself doesn't reject a
 * malformed callback before the controller gets a chance to redirect the
 * user back with a clear status - the official doc doesn't document a
 * distinct "denied" query param the way MP's `error=access_denied` does,
 * so a missing code/state is the only failure shape this DTO needs to
 * allow through.
 */
export class TiendanubeCallbackQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;
}
