import { define } from 'typeorm-seeding';
import Faker from 'faker';
import { Order, OrderItem } from '../../order/entities';
import { State } from '../../order/enums';
import * as _ from 'lodash';

interface Context {
  order: Order;
}

define(OrderItem, (faker: typeof Faker, context: Context) => {
  const { order } = context;
  const orderItem = new OrderItem();
  orderItem.id = faker.random.uuid();
  orderItem.menuItemId = faker.random.uuid();
  orderItem.order = order;
  orderItem.price = faker.random.number({ min: 10000, max: 300000 });
  orderItem.discount = faker.random.number({ min: 0, max: 50000 });
  orderItem.quantity = faker.random.number({ min: 0, max: 5 });
  orderItem.note = faker.lorem.sentence();
  orderItem.state = _.sample(Object.values(State)) as State;
  return orderItem;
});
