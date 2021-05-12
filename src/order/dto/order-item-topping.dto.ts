import { IsNumber, IsString } from 'class-validator';

export class OrderItemTopping {
  @IsString()
  menuItemToppingId?: string;

  @IsString()
  name?: string;

  @IsNumber()
  quantity?: number;

  @IsNumber()
  price?: number;
}
