import { define } from 'typeorm-seeding';
import Faker from 'faker';
import { Delivery, Order } from '../../order/entities';
import * as _ from 'lodash';

interface Context {
  order: Order;
  deliveryStatus: string;
}

define(Delivery, (faker: typeof Faker, context: Context) => {
  const { order, deliveryStatus } = context;

  const delivery = new Delivery();
  delivery.id = faker.random.uuid();
  delivery.customerId = faker.random.uuid();
  delivery.driverId = faker.random.uuid();
  delivery.shippingFee = faker.random.number({ min: 5000, max: 30000 });
  delivery.status = deliveryStatus;
  delivery.address = faker.address.streetAddress(true);
  delivery.order = order;

  const customerGeom = {
    type: 'Point',
    coordinates: [
      parseFloat(faker.address.latitude()),
      parseFloat(faker.address.longitude()),
    ],
  };

  const restaurantGeom = {
    type: 'Point',
    coordinates: [
      parseFloat(faker.address.latitude()),
      parseFloat(faker.address.longitude()),
    ],
  };
  delivery.customerGeom = customerGeom;
  delivery.restaurantGeom = restaurantGeom;
  delivery.distance = faker.random.number({ min: 500, max: 15000 });
  delivery.deliveredAt = faker.date.future();
  return delivery;
});
