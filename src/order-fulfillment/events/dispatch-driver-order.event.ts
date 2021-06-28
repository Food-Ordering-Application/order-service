import { Delivery } from './../../order/entities/delivery.entity';
import { Order } from './../../order/entities/';
export class OrderEventPayload {
  id: string;
  // cashierId?: string;
  // restaurantId?: string;
  // createdAt?: Date;
  // updatedAt?: Date;
  // status?: OrderStatus;
  delivery: DeliveryPayload;
  subTotal: number;
  grandTotal: number;
  invoice: {
    payment: {
      method: string;
    };
  };

  static toPayload(order: Order): OrderEventPayload {
    const {
      id,
      delivery,
      subTotal,
      grandTotal,
      invoice: {
        payment: { method },
      },
    } = order;
    return {
      id,
      delivery: DeliveryPayload.toPayload(delivery),
      subTotal,
      grandTotal,
      invoice: {
        payment: {
          method,
        },
      },
    };
  }
}

export class DeliveryPayload {
  // customerId?: string;
  driverId?: string;
  // customerAddress: string;
  // customerGeom: { type: string; coordinates: number[] };
  // restaurantAddress: string;
  restaurantGeom?: { type: string; coordinates: number[] };
  distance: number;
  shippingFee: number;
  // status: DeliveryStatus;
  // createdAt: Date;
  // updatedAt: Date;
  static toPayload(order: Delivery): DeliveryPayload {
    const { driverId, restaurantGeom, distance, shippingFee } = order;
    return {
      driverId,
      restaurantGeom,
      distance,
      shippingFee,
    };
  }
}
