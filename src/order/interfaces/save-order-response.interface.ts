import { PosOrderDto } from './../dto/pos-order/pos-order.dto';
import { IOrder } from './index';

export interface ISaveOrderResponse {
  status: number;
  message: string;
  data: {
    order: PosOrderDto;
  };
}
