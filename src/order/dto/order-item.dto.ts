import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OrderItemTopping } from './order-item-topping.dto';

export class OrderItem {
  @IsString()
  menuItemId?: string;

  @IsNumber()
  price?: number;

  @IsNumber()
  quantity?: number;

  @IsNumber()
  @IsOptional()
  discount?: number;

  @ValidateNested()
  orderItemToppings?: OrderItemTopping[];
}
