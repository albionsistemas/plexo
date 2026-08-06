import { IsEmail } from 'class-validator';

export class ResolveTenantDto {
  @IsEmail()
  email!: string;
}
