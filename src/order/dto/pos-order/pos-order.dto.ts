import { PType, OrdStatus } from 'src/order/enums';
import { PosOrderItemDto } from './pos-order-item.dto';

export class PosOrderDto {
  id?: string;
  cashierId: string;
  restaurantId: string;
  itemDiscount: number;
  discount: number;
  subTotal: number;
  grandTotal: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
  paymentType: PType;
  status: OrdStatus;
  orderItems: PosOrderItemDto[];
}
