import { IFeedback, IOrder } from './index';

export interface ICreateOrderResponse {
  status: number;
  message: string;
  order: (IOrder & { feedback?: IFeedback }) | null;
  // errors: { [key: string]: any };
}
