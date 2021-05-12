import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemTopping } from './order-item-topping.dto';

export class OrderItem {
  @IsString()
  menuItemId?: string;

  @IsNumber()
  price?: number;

  @IsNumber()
  quantity?: number;

  @IsString()
  name?: string;

  @IsNumber()
  @IsOptional()
  discount?: number;

  @ValidateNested({ each: true })
  @Type(() => OrderItemTopping)
  orderItemToppings?: OrderItemTopping[];
}
