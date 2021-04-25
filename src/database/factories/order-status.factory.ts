import { define } from 'typeorm-seeding';
import Faker from 'faker';
import { OrderStatus } from '../../order/entities';

define(OrderStatus, (faker: typeof Faker) => {
  const orderStatus = new OrderStatus();
  orderStatus.id = faker.random.uuid();
  return orderStatus;
});
