import { IOrderItemTopping } from './index';

export interface IOrderItem {
  id: string;
  menuItemId?: string;
  price?: number;
  discount?: number;
  quantity?: number;
  state?: string;
  orderItemToppings?: IOrderItemTopping[];
}
