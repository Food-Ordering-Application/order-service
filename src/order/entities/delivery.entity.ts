import { DeliveryIssue } from './../enums/delivery-issue.enum';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { DeliveryStatus } from '../enums';
import { Order } from './order.entity';
import { CancelOrderReason } from '.';

@Entity()
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  @Index()
  customerId: string;

  @Column({ nullable: true })
  @Index()
  driverId: string;

  @Column({ nullable: true })
  customerName: string;

  @Column({ nullable: true })
  customerPhoneNumber: string;

  @Column({ nullable: true })
  customerAddress: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  customerGeom: { type: string; coordinates: number[] };

  @Column({ nullable: true })
  restaurantName: string;

  @Column({ nullable: true })
  restaurantPhoneNumber: string;

  @Column({ nullable: true })
  restaurantAddress: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  restaurantGeom: { type: string; coordinates: number[] };

  @Column({ nullable: true })
  totalDeliveryDistance: number;

  @Column({ nullable: true })
  distance: number;

  @Column({ nullable: true })
  shippingFee: number;

  @Column({ enum: DeliveryStatus })
  status: string;

  @Column({ default: null })
  issueNote: string;

  @Column({ enum: DeliveryIssue, default: null })
  issueType: DeliveryIssue;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  @Index()
  orderTime: Date;

  @Column({ nullable: true })
  @Index()
  deliveredAt: Date;

  @Column({ nullable: true })
  expectedDeliveryTime: Date;

  @OneToOne(() => Order, (order) => order.delivery) // specify inverse side as a second parameter
  @JoinColumn()
  order: Order;

  @ManyToOne(
    () => CancelOrderReason,
    (CancelOrderReason) => CancelOrderReason.deliveries,
  )
  @JoinColumn()
  cancelOrderReason: CancelOrderReason;

  @Column({ nullable: true })
  cancelOrderReasonId: number;

  @Column({ nullable: true })
  cancelNote: string;
}
