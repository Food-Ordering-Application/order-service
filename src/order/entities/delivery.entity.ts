import { DeliveryIssue } from './../enums/delivery-issue.enum';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { DeliveryStatus } from '../enums';
import { Order } from './order.entity';

@Entity()
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  customerId: string;

  @Column({ nullable: true })
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
  orderTime: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ nullable: true })
  expectedDeliveryTime: Date;

  @OneToOne(() => Order, (order) => order.delivery) // specify inverse side as a second parameter
  @JoinColumn()
  order: Order;
}
