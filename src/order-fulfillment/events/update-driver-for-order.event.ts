export class UpdateDriverForOrderEventPayload {
  orderId: string;
  driverId: string;
  estimatedArrivalTime: number;
  totalDistance: number;
}
