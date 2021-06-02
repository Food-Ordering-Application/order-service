import { IPayment } from '.';

export interface IInvoice {
  id: string;
  status: string; //InvoiceStatus;
  invoiceNumber: string;
  invoiceDate: Date;
  createdAt: Date;
  updatedAt: Date;
  payment: IPayment;
}
