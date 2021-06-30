import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrdStatus } from '../enums';
import { DeliveryLocation } from './delivery-location.entity';
import { Delivery, OrderItem } from './index';
import { Invoice } from './invoice.entity';

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  cashierId: string;

  @Column({ nullable: true })
  @Index()
  restaurantId: string;

  @Column({ nullable: true })
  itemDiscount: number;

  @Column({ nullable: true })
  discount: number;

  @Column({ nullable: true })
  subTotal: number;

  @Column({ nullable: true })
  grandTotal: number;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @UpdateDateColumn()
  @Index()
  updatedAt: Date;

  @Column({ enum: OrdStatus })
  @Index()
  status: string;

  //? Relations
  @OneToMany(() => OrderItem, (orderItem) => orderItem.order, {
    cascade: ['update', 'insert'],
  })
  orderItems: OrderItem[];

  @OneToOne(() => Delivery, (delivery) => delivery.order) // specify inverse side as a second parameter
  delivery: Delivery;

  @OneToOne(
    () => DeliveryLocation,
    (deliveryLocation) => deliveryLocation.order,
  )
  deliveryLocation: DeliveryLocation;

  @OneToOne(() => Invoice, (invoice) => invoice.order)
  invoice: Invoice;
}
