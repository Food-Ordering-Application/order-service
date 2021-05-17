import { IOrderItem } from './index';
export interface IOrder {
  id: string;
  customerId?: string;
  driverId?: string;
  restaurantId?: string;
  subTotal?: number;
  grandTotal?: number;
  itemDiscount?: number;
  shippingFee?: number;
  promoId?: string;
  discount?: number;
  status?: string;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deliveredAt?: Date;
  orderItems: IOrderItem[];
}
