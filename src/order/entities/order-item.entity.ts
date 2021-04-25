import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Order, OrderItemTopping } from './';
import { State } from '../enums';

@Entity()
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  menuItemId: string;

  @ManyToOne(() => Order, (order) => order.orderItems)
  order: Order;

  @Column()
  price: number;

  @Column({ nullable: true })
  discount: number;

  @Column()
  quantity: number;

  @Column()
  note: string;

  @Column({ enum: State })
  state: string;

  @OneToMany(
    () => OrderItemTopping,
    (orderItemTopping) => orderItemTopping.orderItem,
  )
  orderItemToppings: OrderItemTopping[];
}
