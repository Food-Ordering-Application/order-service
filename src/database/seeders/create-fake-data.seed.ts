import {
  Delivery,
  Order,
  OrderItem,
  OrderItemTopping,
} from '../../order/entities';
import { Factory, Seeder } from 'typeorm-seeding';
import { PType, OrdStatus, DeliveryStatus } from '../../order/enums';
import * as _ from 'lodash';

export default class CreateFakeData implements Seeder {
  public async run(factory: Factory): Promise<any> {
    const draftOrders = await factory(Order)({
      paymentType: PType.COD,
      orderStatus: OrdStatus.DRAFT,
    }).createMany(10);
    const orderedOrders = await factory(Order)({
      paymentType: PType.COD,
      orderStatus: OrdStatus.ORDERED,
    }).createMany(10);
    const completedOrders = await factory(Order)({
      paymentType: PType.COD,
      orderStatus: OrdStatus.COMPLETED,
    }).createMany(20);
    const cancelledOrders = await factory(Order)({
      paymentType: PType.COD,
      orderStatus: OrdStatus.CANCELLED,
    }).createMany(10);

    // ORDERED và 30 order COMPLETED tạo DELIVERY
    const combineOrders = [...orderedOrders, ...completedOrders.slice(0, 10)];

    for (const order of combineOrders) {
      await factory(Delivery)({
        order: order,
        deliveryStatus: _.sample(
          Object.values(DeliveryStatus),
        ) as DeliveryStatus,
      }).create();
    }

    const orders = [
      ...draftOrders,
      ...orderedOrders,
      ...completedOrders,
      ...cancelledOrders,
    ];

    // Với mỗi Order tạo nhiều OrderItems
    for (const order of orders) {
      const orderItems = await factory(OrderItem)({
        order: order,
      }).createMany(2);

      // Với mỗi OrderItem tạo nhiều OrderItemToppings
      for (const orderItem of orderItems) {
        await factory(OrderItemTopping)({
          orderItem: orderItem,
        }).create();
      }
    }
  }
}
