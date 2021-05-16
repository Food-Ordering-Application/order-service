import { State } from './../../enums/state.enum';
import { PosOrderItemToppingDto } from './pos-order-item-topping.dto';

export class PosOrderItemDto {
  id?: string;
  menuItemId: string;
  price: number;
  subTotal: number;
  name: string;
  quantity: number;
  discount: number;
  state: State;
  orderItemToppings: PosOrderItemToppingDto[];
}
