import { IsString, Matches } from 'class-validator';

/**
 * Just the tenant's own CUIT for now - the only Tenant field Preferencias
 * needs to edit (it's what AFIP's certificate is registered under, see
 * AfipCredentialsService). Format-checked only (11 digits, optional
 * dashes) - the real validation is AFIP rejecting an invalid one at WSAA/
 * WSFE time, same as any other AFIP-facing field in this app.
 */
export class UpdateTenantInfoDto {
  @IsString()
  @Matches(/^\d{2}-?\d{8}-?\d{1}$/, { message: 'taxId debe ser un CUIT válido (11 dígitos)' })
  taxId!: string;
}
