import { IsEmail, IsUUID } from 'class-validator';

export class ResendCodeDto {
  @IsUUID()
  tenantId!: string;

  @IsEmail()
  email!: string;
}
