export class GetListOrderOfDriverDto {
  driverId: string;
  callerId: string;
  query: string;
  page: number;
  size: number;
  from?: string;
  to?: string;
}
