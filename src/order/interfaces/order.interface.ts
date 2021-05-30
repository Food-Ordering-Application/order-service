import { IOrderItem } from './index';
export interface IOrder {
  id: string;
  cashierId?: string;
  restaurantId?: string;
  subTotal?: number;
  grandTotal?: number;
  itemDiscount?: number;
  promoId?: string;
  discount?: number;
  status?: string;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
  orderItems: IOrderItem[];
}
