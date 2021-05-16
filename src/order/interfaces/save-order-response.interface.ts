import { IOrder } from './index';

export interface ISaveOrderResponse {
  status: number;
  message: string;
  data: {
    orderId: string;
  };
}
