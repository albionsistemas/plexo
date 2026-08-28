import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateBnaSyncSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;
}
