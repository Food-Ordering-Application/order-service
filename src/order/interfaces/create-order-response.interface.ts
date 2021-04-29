import { IOrder } from './index';

export interface ICreateOrderResponse {
  status: number;
  message: string;
  order: IOrder | null;
  // errors: { [key: string]: any };
}
