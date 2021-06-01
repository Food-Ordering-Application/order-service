import { IDelivery, IInvoice } from '.';

export class ICustomerOrder {
  id: string;
  cashierId: string;
  restaurantId: string;
  itemDiscount: number;
  discount: number;
  subTotal: number;
  grandTotal: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  delivery: IDelivery;
  invoice: IInvoice;
}
