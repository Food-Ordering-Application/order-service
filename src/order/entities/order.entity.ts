import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PType } from '../enums';
import { OrderStatus, PaymentType } from './index';
import { OrderItem } from './order-item.entity';

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  customerId: string;

  @Column({ nullable: true })
  driverId: string;

  @Column({ nullable: true })
  restaurantId: string;

  @Column({ nullable: true })
  subTotal: number;

  @Column({ nullable: true })
  itemDiscount: number;

  @Column({ default: 15000, nullable: true })
  shippingFee: number;

  @Column({ default: 2000, nullable: true })
  serviceFee: number;

  @Column({ nullable: true })
  discount: number;

  @Column({ nullable: true })
  grandTotal: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @ManyToOne(() => PaymentType, (paymentType) => paymentType.orders)
  paymentType: PaymentType;

  @ManyToOne(() => OrderStatus, (orderStatus) => orderStatus.orders)
  status: OrderStatus;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order)
  orderItems: OrderItem[];
}
