export class UpdateDeliveryAddressDto {
  orderId: string;
  newAddress: {
    address: string;
    geom: { type: string; coordinates: number[] };
  };
}
