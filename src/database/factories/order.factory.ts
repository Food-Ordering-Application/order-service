import { define } from 'typeorm-seeding';
import Faker from 'faker';
import { Order } from '../../order/entities';
import * as _ from 'lodash';

interface Context {
  paymentType: string;
  orderStatus: string;
}

define(Order, (faker: typeof Faker, context: Context) => {
  const { orderStatus, paymentType } = context;

  const order = new Order();
  order.id = faker.random.uuid();
  order.customerId = faker.random.uuid();
  order.driverId = faker.random.uuid();
  order.restaurantId = faker.random.uuid();
  order.subTotal = faker.random.number({ min: 20000, max: 300000 });
  do {
    order.grandTotal = faker.random.number({ min: 20000, max: 300000 });
  } while (order.grandTotal < order.subTotal);
  order.itemDiscount = faker.random.number({ min: 20000, max: 300000 });
  order.shippingFee = faker.random.number({ min: 5000, max: 30000 });
  order.serviceFee = faker.random.number({ min: 0, max: 10000 });
  order.discount = faker.random.number({ min: 0, max: 10000 });
  order.paymentType = paymentType;
  order.status = orderStatus;
  // order.status
  order.deliveredAt = faker.date.future();
  return order;
});
