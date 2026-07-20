import { AccountType } from '@plexo/database';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;
}
