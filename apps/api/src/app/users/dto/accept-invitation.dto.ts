import { IsString, IsUUID, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  token!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
