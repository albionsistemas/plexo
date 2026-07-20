import { IsBoolean, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class CreateCurrencyDto {
  @IsString()
  @Length(3, 3)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean;
}
