import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  @IsUUID()
  tenantId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Bumps the token's expiry from JWT_EXPIRES_IN (default 8h) to
  // JWT_REMEMBER_ME_EXPIRES_IN (default 30d) - see AuthService.login.
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
