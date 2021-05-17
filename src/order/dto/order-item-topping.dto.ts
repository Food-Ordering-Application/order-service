import { IsNumber, IsString } from 'class-validator';

export class OrderItemTopping {
  @IsString()
  toppingItemId?: string;

  @IsString()
  name?: string;

  @IsNumber()
  quantity?: number;

  @IsNumber()
  price?: number;
}
