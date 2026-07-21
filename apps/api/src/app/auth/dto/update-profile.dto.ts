import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Avatar is a URL only - no file storage infra exists in this project yet
 * (see PROGRESS.md). An empty string clears it back to the
 * initials-based fallback the frontend renders when avatarUrl is unset.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string;

  @IsOptional()
  @IsBoolean()
  showOnlinePresence?: boolean;
}
