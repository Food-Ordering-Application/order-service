import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { PType, OrdStatus } from '../enums';
import { Delivery } from './delivery.entity';
import { OrderItem } from './order-item.entity';

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  cashierId: string;

  @Column({ nullable: true })
  restaurantId: string;

  @Column({ nullable: true })
  itemDiscount: number;

  @Column({ nullable: true })
  discount: number;

  @Column({ nullable: true })
  total: number;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ enum: PType })
  paymentType: string;

  @Column({ enum: OrdStatus })
  status: string;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order)
  orderItems: OrderItem[];

  @OneToOne(() => Delivery, (delivery) => delivery.order) // specify inverse side as a second parameter
  delivery: Delivery;
}
