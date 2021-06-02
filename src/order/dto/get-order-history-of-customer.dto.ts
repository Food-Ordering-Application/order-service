import { GetOrdersOfCustomerDto } from '.';
import { OrdStatus } from '../enums';

export class GetOrderHistoryOfCustomerDto extends GetOrdersOfCustomerDto {
  filter: OrdStatus.COMPLETED | OrdStatus.CANCELLED;
}
