import { IsEmail, IsUUID, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsUUID()
  tenantId!: string;

  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;
}
