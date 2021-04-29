import { Repository } from 'typeorm';
import {
  OrderItem as OrderItemDto,
  OrderItemTopping as OrderItemToppingDto,
} from '../dto';
import { OrderItemTopping, OrderItem, Order } from '../entities';
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

export const calculateSubTotal = (orderItems: OrderItem[]): number => {
  let subTotal = 0;
  for (const orderItem of orderItems) {
    let totalToppingPrice = 0;
    for (let i = 0; i < orderItem.orderItemToppings.length; i++) {
      totalToppingPrice +=
        orderItem.orderItemToppings[i].price *
        orderItem.orderItemToppings[i].quantity;
    }
    subTotal += (orderItem.price + totalToppingPrice) * orderItem.quantity;
  }
  return subTotal;
};

// export const calculateGrandTotal = (
//   subTotal: number,
//   serviceFee: number,
//   shippingFee: number,
// ): number => {
//   return subTotal + serviceFee + shippingFee;
// };
export const calculateGrandTotal = (order: Order): number => {
  const { subTotal, serviceFee, shippingFee } = order;
  return subTotal + serviceFee + shippingFee;
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
