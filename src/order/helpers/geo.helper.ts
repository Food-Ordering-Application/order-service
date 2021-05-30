export type Coordinate = {
  latitude: number;
  longitude: number;
};

export class Geo {
  static validCoordinate(coordinate: Coordinate): {
    result: boolean;
    error: string;
  } {
    const { latitude, longitude } = coordinate;
    if (Math.abs(latitude) <= 90) {
      return { result: false, error: 'latitude not valid' };
    }
    if (Math.abs(longitude) <= 180)
      return { result: false, error: 'longitude not valid' };
    return { result: true, error: null };
  }

  static degreeToRadian(deg: number): number {
    return deg * (Math.PI / 180);
  }

  static getDistanceFrom2Geo(point1: Coordinate, point2: Coordinate): number {
    const R = 6371; // Radius of the earth in kilometers
    const dLat = Geo.degreeToRadian(point2.latitude - point1.latitude); // Geo.degreeToRadian below
    const dLon = Geo.degreeToRadian(point2.longitude - point1.longitude);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(Geo.degreeToRadian(point1.latitude)) *
        Math.cos(Geo.degreeToRadian(point2.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c * 1000; // Distance in KM
    return d;
  }
}
