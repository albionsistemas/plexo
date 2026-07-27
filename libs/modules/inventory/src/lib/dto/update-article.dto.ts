import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateArticleDto {
  @IsOptional()
  @IsBoolean()
  isService?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
