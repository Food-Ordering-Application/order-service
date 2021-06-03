import { ICustomerOrder } from '.';

export interface ICustomerOrdersResponse {
  status: number;
  message: string;
  orders: ICustomerOrder[] | null;
}
