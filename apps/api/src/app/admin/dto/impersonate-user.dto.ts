import { IsString, MinLength } from 'class-validator';

export class ImpersonateUserDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
