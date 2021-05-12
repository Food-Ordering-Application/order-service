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
import { OrderItemTopping, OrderItem, Order, Delivery } from '../entities';
import { State } from '../enums';

export const createAndStoreOrderItem = async (
  orderItem: OrderItemDto,
  orderItemToppingRepository: Repository<OrderItemTopping>,
  orderItemRepository: Repository<OrderItem>,
) => {
  const {
    menuItemId,
    price: orderItemPrice,
    quantity: orderItemQuantity,
    orderItemToppings,
  } = orderItem;

  const addOrderItem = new OrderItem();
  addOrderItem.menuItemId = menuItemId;
  addOrderItem.price = orderItemPrice;
  addOrderItem.quantity = orderItemQuantity;

  let totalPriceToppings = 0;
  // Tạo và lưu orderItemTopping
  if (orderItemToppings) {
    const addOrderItemToppings: OrderItemTopping[] = [];
    for (let i = 0; i < orderItemToppings.length; i++) {
      const addOrderItemTopping = new OrderItemTopping();
      addOrderItemTopping.menuItemToppingId =
        orderItemToppings[i].menuItemToppingId;
      addOrderItemTopping.price = orderItemToppings[i].price;
      addOrderItemTopping.quantity = orderItemToppings[i].quantity;
      addOrderItemTopping.state = State.IN_STOCK;
      await orderItemToppingRepository.save(addOrderItemTopping);
      addOrderItemToppings.push(addOrderItemTopping);
      totalPriceToppings +=
        orderItemToppings[i].price * orderItemToppings[i].quantity;
    }
    addOrderItem.orderItemToppings = addOrderItemToppings;
  }
  const addOrderItems: OrderItem[] = [];
  addOrderItems.push(addOrderItem);
  await orderItemRepository.save(addOrderItem);
  return {
    addOrderItems,
    totalPriceToppings,
  };
};

export const checkEqualTopping = (
  sendItemToppings: OrderItemToppingDto[],
  orderItemToppings: OrderItemTopping[],
) => {
  // Sort 2 array
  sendItemToppings.sort(compare);
  orderItemToppings.sort(compare);
  // Nếu length ko bằng nhau thì false
  if (sendItemToppings.length !== orderItemToppings.length) return false;
  // So từng phần tử 2 bên
  for (let i = 0; i < sendItemToppings.length; i++) {
    // Nếu từng phần tử 2 bên không giống nhau
    if (
      sendItemToppings[i].menuItemToppingId !==
      orderItemToppings[i].menuItemToppingId
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
  let total = 0;
  for (const orderItem of orderItems) {
    let totalToppingPrice = 0;
    for (let i = 0; i < orderItem.orderItemToppings.length; i++) {
      totalToppingPrice +=
        orderItem.orderItemToppings[i].price *
        orderItem.orderItemToppings[i].quantity;
    }
    total += (orderItem.price + totalToppingPrice) * orderItem.quantity;
  }
  return total;
};

export const calculateOrderGrandToTal = (order: Order): number => {
  //TODO: Nếu là order salechannel
  if (order.delivery) {
    //TODO: Nếu người dùng đã có địa chỉ
    if (order.delivery.shippingFee) {
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
  if (a.menuItemToppingId < b.menuItemToppingId) return -1;
  if (a.menuItemToppingId > b.menuItemToppingId) return 1;
  return 0;
};

interface ICalculateShippingFeeResponse {
  shippingFee: number;
  distance: number;
}

//* Calculate shippingFee
export const calculateShippingFee = async (
  deliveryRepository: Repository<Delivery>,
  restaurantGeom,
  customerGeom,
): Promise<ICalculateShippingFeeResponse> => {
  let shippingFee;
  const { st_distance } = await deliveryRepository
    .createQueryBuilder('delivery')
    .select(
      `ST_Distance(
        ST_Transform(ST_SetSRID(ST_MakePoint(${restaurantGeom.coordinates[1]}, ${restaurantGeom.coordinates[0]}), 4326), 3857),
        ST_Transform(ST_SetSRID(ST_MakePoint(${customerGeom.coordinates[1]}, ${customerGeom.coordinates[0]}), 4326), 3857)
        )`,
    )
    .getRawOne();
  /* Nếu khoảng cách <3km thì phí ship là 15000đồng, mỗi 1km 5000 đồng*/
  if (st_distance <= FIRST_SHIPPING_KILOMETER)
    shippingFee = FIRST_THREE_KILOMETER_FEE;
  else {
    const extraKilometer = Math.floor(
      (st_distance - FIRST_SHIPPING_KILOMETER) / 1000,
    );
    shippingFee =
      FIRST_THREE_KILOMETER_FEE + (extraKilometer + 1) * EXTRA_KILOMETER_FEE;
  }
  return { shippingFee, distance: st_distance };
};
