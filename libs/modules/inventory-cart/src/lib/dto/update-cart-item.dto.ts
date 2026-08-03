import { IsNumber, IsPositive } from 'class-validator';

export class UpdateCartItemDto {
  @IsNumber()
  @IsPositive()
  quantity!: number;
}
