import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SendFollowUpEmailDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  @MinLength(1)
  text!: string;
}
