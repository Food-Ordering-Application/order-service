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

  @Column({ default: 30000 })
  subTotal: number;

  @Column()
  name: string;

  @Column()
  quantity: number;

  @Column({ nullable: true, default: 0 })
  discount: number;

  @Column({ enum: State, default: State.IN_STOCK })
  state: string;

  @OneToMany(
    () => OrderItemTopping,
    (orderItemTopping) => orderItemTopping.orderItem,
    {
      cascade: ['update', 'insert'],
    },
  )
  orderItemToppings: OrderItemTopping[];
}
