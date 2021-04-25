import {
  Order,
  OrderItem,
  OrderItemTopping,
  OrderStatus,
  PaymentType,
} from '../../order/entities';
import { Factory, Seeder } from 'typeorm-seeding';
import { PType, Status } from '../../order/enums';

export default class CreateFakeData implements Seeder {
  public async run(factory: Factory): Promise<any> {
    const COD = await factory(PaymentType)().create({ name: PType.COD });
    const PAYPAL = await factory(PaymentType)().create({ name: PType.PAYPAL });
    const DRAFT = await factory(OrderStatus)().create({ name: Status.DRAFT });
    const WAITING_DRIVER = await factory(OrderStatus)().create({
      name: Status.WAITING_DRIVER,
    });
    const CHECKING = await factory(OrderStatus)().create({
      name: Status.CHECKING,
    });
    const PICKING = await factory(OrderStatus)().create({
      name: Status.PICKING,
    });
    const DELIVERING = await factory(OrderStatus)().create({
      name: Status.DELIVERING,
    });
    const CANCELLED = await factory(OrderStatus)().create({
      name: Status.CANCELLED,
    });

    const firstOrders = await factory(Order)({
      paymentType: COD,
      orderStatus: DRAFT,
    }).createMany(30);
    const secondOrders = await factory(Order)({
      paymentType: COD,
      orderStatus: WAITING_DRIVER,
    }).createMany(30);
    const thirdOrders = await factory(Order)({
      paymentType: COD,
      orderStatus: CHECKING,
    }).createMany(30);
    const fourthOrders = await factory(Order)({
      paymentType: COD,
      orderStatus: PICKING,
    }).createMany(30);
    const fifthOrders = await factory(Order)({
      paymentType: COD,
      orderStatus: DELIVERING,
    }).createMany(30);
    const sixthOrders = await factory(Order)({
      paymentType: COD,
      orderStatus: CANCELLED,
    }).createMany(30);
    const seventhOrders = await factory(Order)({
      paymentType: PAYPAL,
      orderStatus: DRAFT,
    }).createMany(30);
    const eighthOrders = await factory(Order)({
      paymentType: PAYPAL,
      orderStatus: DRAFT,
    }).createMany(30);
    const ninethOrders = await factory(Order)({
      paymentType: PAYPAL,
      orderStatus: DRAFT,
    }).createMany(30);
    const tenthOrders = await factory(Order)({
      paymentType: PAYPAL,
      orderStatus: DRAFT,
    }).createMany(30);
    const eleventhOrders = await factory(Order)({
      paymentType: PAYPAL,
      orderStatus: DRAFT,
    }).createMany(30);
    const twelvethOrders = await factory(Order)({
      paymentType: PAYPAL,
      orderStatus: DRAFT,
    }).createMany(30);

    const orders = [
      ...firstOrders,
      ...secondOrders,
      ...thirdOrders,
      ...fourthOrders,
      ...fifthOrders,
      ...sixthOrders,
      ...seventhOrders,
      ...eighthOrders,
      ...ninethOrders,
      ...tenthOrders,
      ...eleventhOrders,
      ...twelvethOrders,
    ];

    // Với mỗi Order tạo nhiều OrderItems
    for (const order of orders) {
      const orderItems = await factory(OrderItem)({
        order: order,
      }).createMany(5);

      // Với mỗi OrderItem tạo nhiều OrderItemToppings
      for (const orderItem of orderItems) {
        await factory(OrderItemTopping)({
          orderItem: orderItem,
        }).createMany(Math.floor(Math.random() * 4));
      }
    }
  }
}
