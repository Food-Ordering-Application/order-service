import { IOrder } from './index';

export interface IOrdersResponse {
  status: number;
  message: string;
  orders: IOrder[] | null;
}
