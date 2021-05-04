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
  serviceFee?: number;
  promoId?: string;
  discount?: number;
  paymentType?: string;
  status?: string;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deliveredAt?: Date;
  orderItems: IOrderItem[];
}
