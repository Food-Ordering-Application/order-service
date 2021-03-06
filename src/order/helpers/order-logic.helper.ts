import { Repository } from 'typeorm';
import {
  EXTRA_KILOMETER_FEE,
  FIRST_SHIPPING_KILOMETER,
  FIRST_THREE_KILOMETER_FEE,
} from '../constants';
import {
  OrderItem as OrderItemDto,
  OrderItemTopping as OrderItemToppingDto,
} from '../dto';
import {
  OrderItemTopping,
  OrderItem,
  Order,
  Delivery,
  Invoice,
  Payment,
} from '../entities';
import { PaymentMethod, PaymentStatus, State } from '../enums';
import { Coordinate, Geo } from './geo.helper';

export const createAndStoreOrderItem = async (
  orderItem: OrderItemDto,
  queryRunner,
) => {
  const {
    menuItemId,
    price: orderItemPrice,
    quantity: orderItemQuantity,
    orderItemToppings,
    name,
  } = orderItem;

  const addOrderItem = new OrderItem();
  addOrderItem.menuItemId = menuItemId;
  addOrderItem.price = orderItemPrice;
  addOrderItem.quantity = orderItemQuantity;
  addOrderItem.name = name;

  let totalPriceToppings = 0;
  // Tạo và lưu orderItemTopping
  if (orderItemToppings) {
    const addOrderItemToppings: OrderItemTopping[] = [];
    for (let i = 0; i < orderItemToppings.length; i++) {
      const addOrderItemTopping = new OrderItemTopping();
      addOrderItemTopping.toppingItemId = orderItemToppings[i].toppingItemId;
      addOrderItemTopping.price = orderItemToppings[i].price;
      addOrderItemTopping.quantity = orderItemToppings[i].quantity;
      addOrderItemTopping.name = orderItemToppings[i].name;
      addOrderItemTopping.state = State.IN_STOCK;
      await queryRunner.manager.save(OrderItemTopping, addOrderItemTopping);
      addOrderItemToppings.push(addOrderItemTopping);
      totalPriceToppings +=
        orderItemToppings[i].price * orderItemToppings[i].quantity;
    }
    addOrderItem.orderItemToppings = addOrderItemToppings;
  }
  addOrderItem.subTotal = totalPriceToppings + orderItemPrice;
  const addOrderItems: OrderItem[] = [];
  addOrderItems.push(addOrderItem);
  await queryRunner.manager.save(OrderItem, addOrderItem);
  return {
    addOrderItems,
    totalPriceToppings,
  };
};

export const checkEqualTopping = (
  sendItemToppings: OrderItemToppingDto[],
  orderItemToppings: OrderItemTopping[],
) => {
  //? Nếu sendItemToppings === null và orderItemToppings === null hoặc []
  if (
    !sendItemToppings &&
    (!orderItemToppings || orderItemToppings.length === 0)
  ) {
    return true;
  } else if (
    !sendItemToppings &&
    orderItemToppings &&
    orderItemToppings.length > 0
  ) {
    return false;
  } else if (
    sendItemToppings &&
    (!orderItemToppings || orderItemToppings.length === 0)
  ) {
    return false;
  }
  // Sort 2 array
  sendItemToppings.sort(compare);
  orderItemToppings.sort(compare);
  // Nếu length ko bằng nhau thì false
  if (sendItemToppings.length !== orderItemToppings.length) return false;
  // So từng phần tử 2 bên
  for (let i = 0; i < sendItemToppings.length; i++) {
    // Nếu từng phần tử 2 bên không giống nhau
    if (
      sendItemToppings[i].toppingItemId !== orderItemToppings[i].toppingItemId
    ) {
      return false;
    } else {
      // Nếu giống nhưng khác số lượng
      if (sendItemToppings[i].quantity !== orderItemToppings[i].quantity)
        return false;
    }
  }
  return true;
};

export const calculateOrderSubTotal = (orderItems: OrderItem[]): number => {
  const subTotal = orderItems.reduce((currentSubTotal, orderItem) => {
    const { orderItemToppings, price, quantity } = orderItem;
    const totalToppingPrice = orderItemToppings.reduce(
      (currentToppingPrice, orderItemTopping) => {
        const { price, quantity } = orderItemTopping;
        return currentToppingPrice + price * quantity;
      },
      0,
    );
    return currentSubTotal + (price + totalToppingPrice) * quantity;
  }, 0);
  return subTotal;
};

export const calculateOrderGrandToTal = (order: Order): number => {
  //TODO: Nếu là order salechannel
  if (order.delivery) {
    //TODO: Nếu người dùng đã có địa chỉ
    if (order.delivery.customerAddress && order.delivery.customerGeom) {
      return order.subTotal + order.delivery.shippingFee;
    } else {
      return order.subTotal;
    }
  } else {
    return order.subTotal;
  }
};

export const findOrderItem = (
  sendItem: OrderItemDto,
  orderItems: OrderItem[],
) => {
  return orderItems.find((item) => {
    const isEqual = checkEqualTopping(
      sendItem.orderItemToppings,
      item.orderItemToppings,
    );
    return item.menuItemId === sendItem.menuItemId && isEqual;
  });
};

export const findOrderItemIndex = (
  sendItem: OrderItemDto,
  orderItems: OrderItem[],
) => {
  return orderItems.findIndex((item) => {
    const isEqual = checkEqualTopping(
      sendItem.orderItemToppings,
      item.orderItemToppings,
    );
    return item.menuItemId === sendItem.menuItemId && isEqual;
  });
};

const compare = (
  a: OrderItemTopping | OrderItemToppingDto,
  b: OrderItemTopping | OrderItemToppingDto,
) => {
  if (a.toppingItemId < b.toppingItemId) return -1;
  if (a.toppingItemId > b.toppingItemId) return 1;
  return 0;
};

interface ICalculateShippingFeeResponse {
  shippingFee: number;
  distance: number;
}

//* Calculate shippingFee
export const calculateShippingFee = (
  restaurantGeom,
  customerGeom,
): ICalculateShippingFeeResponse => {
  let shippingFee;

  const restaurantGeo: Coordinate = {
    latitude: restaurantGeom.coordinates[1],
    longitude: restaurantGeom.coordinates[0],
  };

  const customerGeo: Coordinate = {
    latitude: customerGeom.coordinates[1],
    longitude: customerGeom.coordinates[0],
  };

  const rawDistance = Geo.getDistanceFrom2Geo(restaurantGeo, customerGeo);
  const distance = Math.round(rawDistance / 100) * 100;

  /* Nếu khoảng cách <3km thì phí ship là 15000đồng, mỗi 1km 5000 đồng*/
  if (distance <= FIRST_SHIPPING_KILOMETER)
    shippingFee = FIRST_THREE_KILOMETER_FEE;
  else {
    shippingFee =
      FIRST_THREE_KILOMETER_FEE +
      ((distance - FIRST_SHIPPING_KILOMETER) / 1000) * EXTRA_KILOMETER_FEE;
  }
  return { shippingFee, distance };
};

export const calculateExpectedDeliveryTime = (
  orderTime: Date,
  restaurantPreparationTime: number,
  deliveryDistance: number,
) => {
  const MIN_DELIVERY_TIME = 30;
  // thoi gian giao hang du kien =
  // max(thoi gian chuan bi, thoi gian shipper toi cua hang) +
  const pickUpTime = restaurantPreparationTime;
  // thoi gian di chuyen cua shipper (average_time_per_1km * distance)
  const AVG_TIME_PER_1KM = 10;
  const deliveryTime = (deliveryDistance / 1000) * AVG_TIME_PER_1KM;

  const totalDeliveryTime = Math.max(
    pickUpTime + deliveryTime,
    MIN_DELIVERY_TIME,
  );
  const expectedDeliveryTime = new Date(
    orderTime.getTime() + totalDeliveryTime * 1000 * 60,
  );
  return expectedDeliveryTime;
};

export const getPreparationTime = (order: Order) => 15;

export const setPayment = (
  payment: Payment,
  order: Order,
  invoice: Invoice,
  paymentMethod: string,
) => {
  payment.amount = calculateOrderGrandToTal(order);
  payment.invoice = invoice;
  if (paymentMethod === PaymentMethod.COD) {
    payment.status = PaymentStatus.PROCESSING;
  } else {
    payment.status = PaymentStatus.PENDING_USER_ACTION;
  }
  payment.method = paymentMethod;
  return payment;
};
