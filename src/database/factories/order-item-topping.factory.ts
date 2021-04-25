import { define } from 'typeorm-seeding';
import Faker from 'faker';
import { OrderItem, OrderItemTopping } from '../../order/entities';
import * as _ from 'lodash';
import { State } from '../../order/enums';

interface Context {
  orderItem: OrderItem;
}

define(OrderItemTopping, (faker: typeof Faker, context: Context) => {
  const { orderItem } = context;
  const orderItemTopping = new OrderItemTopping();
  orderItemTopping.id = faker.random.uuid();
  orderItemTopping.orderItem = orderItem;
  orderItemTopping.menuItemToppingId = faker.random.uuid();
  orderItemTopping.price = faker.random.number({ min: 10000, max: 300000 });
  orderItemTopping.quantity = faker.random.number({ min: 0, max: 5 });
  orderItemTopping.state = _.sample(Object.values(State)) as State;
  return orderItemTopping;
});
