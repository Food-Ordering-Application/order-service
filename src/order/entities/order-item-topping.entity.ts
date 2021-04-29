import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { State } from '../enums';
import { OrderItem } from './order-item.entity';

@Entity()
export class OrderItemTopping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  menuItemToppingId: string;

  @Column()
  quantity: number;

  @Column({ nullable: true })
  price: number;

  @Column({ enum: State, nullable: true, default: State.IN_STOCK })
  state: string;

  @ManyToOne(() => OrderItem, (orderItem) => orderItem.orderItemToppings)
  orderItem: OrderItem;
}
