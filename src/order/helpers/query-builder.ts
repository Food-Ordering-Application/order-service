import * as momenttimezone from 'moment-timezone';
import {
  RestaurantOrderStatisticsDto,
  RestaurantRevenueInsightDto,
} from '../dto';
const getOrderStatisticsQuery = (
  restaurantId: string,
  from: string,
  to: string,
  groupByInterval: 'week' | 'day',
) => {
  const propName = RestaurantOrderStatisticsDto.getPropName();

  const convertToVietNamTimezoneString = (date) =>
    momenttimezone.tz(date, 'Asia/Ho_Chi_Minh').utc().format();
  const formattedFrom = `'${convertToVietNamTimezoneString(from)}'`;
  const formattedTo = `'${convertToVietNamTimezoneString(to)}'`;
  const timeInterval = `1 ${groupByInterval}`;

  const belongToRestaurant = `o."restaurantId" = '${restaurantId}'`;
  const orderIsCompleted = `o.status = 'COMPLETED'`;
  const inDateRange = `o."createdAt" >= ${formattedFrom} and o."createdAt" < ${formattedTo}`;

  return `
    select 
      time_interval.t as "${propName.columnName}",

      count(o.id) as "${propName.allOrderCount}",
      sum(case when o.id is null then 0 else o."subTotal" end) as "${propName.allOrderTotalRevenue}", 

      count(case when d.id is not null then 1 else null end) as "${propName.saleOrderCount}", 
      sum(CASE WHEN d.id is not null THEN o."subTotal" ELSE 0 END) as "${propName.saleOrderTotalRevenue}",
      
      count(case when d.id is null and o.id is not null then 1 else null end) as "${propName.posOrderCount}",
      sum(CASE WHEN d.id is null and o.id is not null THEN o."subTotal" ELSE 0 END) as "${propName.posOrderTotalRevenue}"
    from 
      (SELECT 
        generate_series(${formattedFrom}, ${formattedTo}, '${timeInterval}'::interval) AS t
      ) as time_interval
      left join 
				public.order o 
      	on o."createdAt" >= time_interval.t 
					and o."createdAt" < time_interval.t + '${timeInterval}'::interval
					and ${belongToRestaurant}
					and ${orderIsCompleted}
					and ${inDateRange}
      left join 
				delivery d 
      	on o.id = d."orderId" 
    where o.id is null or 
			(${belongToRestaurant}
  	    and ${orderIsCompleted}
  	    and ${inDateRange}
			)
    group by time_interval.t
    order by time_interval.t`;
};

const getRevenueQuery = (restaurantId: string, from: string, to: string) => {
  const propName = RestaurantRevenueInsightDto.getPropName();

  const convertToVietNamTimezoneString = (date) =>
    momenttimezone.tz(date, 'Asia/Ho_Chi_Minh').utc().format();
  const formattedFrom = `'${convertToVietNamTimezoneString(from)}'`;
  const formattedTo = `'${convertToVietNamTimezoneString(to)}'`;

  const belongToRestaurant = `o."restaurantId" = '${restaurantId}'`;
  const orderIsCompleted = `o.status = 'COMPLETED'`;
  const inDateRange = `o."createdAt" >= ${formattedFrom} and o."createdAt" < ${formattedTo}`;

  return `
  select 
    count(o.id) as "${propName.allOrderCount}",
    sum(case when o.id is null then 0 else o."subTotal" end) as "${propName.allOrderTotalRevenue}", 

    count(case when d.id is not null then 1 else null end) as "${propName.saleOrderCount}", 
    sum(CASE WHEN d.id is not null THEN o."subTotal" ELSE 0 END) as "${propName.saleOrderTotalRevenue}",
    
    count(case when p."method" = 'COD' then 1 else null end) as "${propName.saleCODOrderCount}", 
    sum(CASE WHEN p."method" = 'COD' THEN o."subTotal" ELSE 0 END) as "${propName.saleCODOrderTotalRevenue}",
    
    count(case when p."method" <> 'COD' then 1 else null end) as "${propName.saleOnlineOrderCount}",
    sum(CASE WHEN p."method" <> 'COD' THEN o."subTotal" ELSE 0 END) as "${propName.saleOnlineOrderTotalRevenue}",

    count(case when d.id is null and o.id is not null then 1 else null end) as "${propName.posOrderCount}",
    sum(CASE WHEN d.id is null and o.id is not null THEN o."subTotal" ELSE 0 END) as "${propName.posOrderTotalRevenue}"
  from public.order o
    left join delivery d 
      on o.id = d."orderId"
    left join invoice i 
      on o.id = i."orderId"
    left join payment p
      on i.id = p."invoiceId"
  where  
    ${belongToRestaurant}
    and ${orderIsCompleted}
    and ${inDateRange}
  `;
};

export { getOrderStatisticsQuery, getRevenueQuery };
