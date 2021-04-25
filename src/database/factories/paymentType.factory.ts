import { define } from 'typeorm-seeding';
import Faker from 'faker';
import { PaymentType } from '../../order/entities';

define(PaymentType, (faker: typeof Faker) => {
  const paymentType = new PaymentType();
  paymentType.id = faker.random.uuid();
  return paymentType;
});
