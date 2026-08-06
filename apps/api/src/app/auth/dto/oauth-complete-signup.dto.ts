import { IsOptional, IsString, MinLength } from 'class-validator';

export class OAuthCompleteSignupDto {
  @IsString()
  oauthSignupToken!: string;

  @IsString()
  @MinLength(1)
  tenantName!: string;

  @IsOptional()
  @IsString()
  taxId?: string;
}
