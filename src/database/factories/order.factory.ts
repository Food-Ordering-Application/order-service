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

  const myArray = [
    'f1db260f-b2fa-4862-9041-2a7d3b481733',
    '96c8540f-d1ee-427a-9932-eb98a1d8872d',
    '5e3d5b0d-f370-40cd-9f21-c0e002085e55',
  ];

  const myArray1 = [
    '2021-05-08 04:45:56.647276',
    '2021-12-08 04:45:56.647276',
    '2022-03-22 04:45:56.647276',
  ];

  const order = new Order();
  order.id = faker.random.uuid();
  order.cashierId = faker.random.uuid();
  order.restaurantId = myArray[Math.floor(Math.random() * myArray.length)];
  order.subTotal = faker.random.number({ min: 20000, max: 300000 });
  do {
    order.grandTotal = faker.random.number({ min: 20000, max: 300000 });
  } while (order.grandTotal < order.subTotal);
  order.itemDiscount = faker.random.number({ min: 20000, max: 300000 });
  order.serviceFee = faker.random.number({ min: 0, max: 10000 });
  order.discount = faker.random.number({ min: 0, max: 10000 });
  order.paymentType = paymentType;
  order.status = orderStatus;
  order.createdAt = new Date(
    myArray1[Math.floor(Math.random() * myArray1.length)],
  );
  return order;
});
