import { ICustomerOrder, IFeedback } from '.';

export interface ICustomerOrdersResponse {
  status: number;
  message: string;
  orders: (ICustomerOrder & { feedback?: IFeedback })[] | null;
}
