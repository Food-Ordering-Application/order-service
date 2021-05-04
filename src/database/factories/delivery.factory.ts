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
  const latitude = faker.address.latitude();
  const longtitude = faker.address.longitude();

  const geom = {
    type: 'Point',
    coordinates: [parseFloat(longtitude), parseFloat(latitude)],
  };
  delivery.geom = geom;
  delivery.deliveredAt = faker.date.future();
  delivery.total = faker.random.number({ min: 30000, max: 100000 });
  return delivery;
});
