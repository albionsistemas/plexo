import { IsString, IsUUID } from 'class-validator';

export class OAuthChooseTenantDto {
  @IsString()
  resolutionToken!: string;

  @IsUUID()
  tenantId!: string;
}
