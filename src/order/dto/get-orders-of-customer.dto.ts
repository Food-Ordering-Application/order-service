export class GetOrdersOfCustomerDto {
  customerId: string;
  offset: number;
  limit: number;
  from?: string;
  to?: string;
}
