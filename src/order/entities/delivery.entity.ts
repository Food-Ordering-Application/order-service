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
  address: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  customerGeom: { type: string; coordinates: number[] };

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  restaurantGeom: { type: string; coordinates: number[] };

  @Column({ default: 15000, nullable: true })
  shippingFee: number;

  @Column({ enum: DeliveryStatus })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @OneToOne(() => Order, (order) => order.delivery) // specify inverse side as a second parameter
  @JoinColumn()
  order: Order;
}
