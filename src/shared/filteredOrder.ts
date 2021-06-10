const allowed = [
  'id',
  'restaurantId',
  'status',
  'grandTotal',
  'cashierId',
  'delivery',
];

const filteredOrder = (order: any, allowedKey: Array<string>) =>
  Object.keys(order)
    .filter((key) => allowedKey.includes(key))
    .reduce((obj, key) => {
      obj[key] = order[key];
      return obj;
    }, {});
export { allowed, filteredOrder };
