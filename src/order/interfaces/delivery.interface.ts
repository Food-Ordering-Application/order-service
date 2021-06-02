import { DeliveryIssue } from '../enums';

export interface IDelivery {
  id: string;
  customerId: string;
  driverId: string;
  customerName: string;
  customerPhoneNumber: string;
  customerAddress: string;
  customerGeom: { type: string; coordinates: number[] };
  restaurantName: string;
  restaurantPhoneNumber: string;
  restaurantAddress: string;
  restaurantGeom: { type: string; coordinates: number[] };
  distance: number;
  shippingFee: number;
  status: string;
  issueNote: string;
  issueType: DeliveryIssue;
  createdAt: Date;
  updatedAt: Date;
  orderTime: Date;
  deliveredAt: Date;
  expectedDeliveryTime: Date;
}
