import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity()
export class DeliveryLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Order, (order) => order.deliveryLocation)
  @JoinColumn()
  order: Order;

  @Column()
  orderId: string;

  @Column({ nullable: true })
  cityId: string;

  @Column({ nullable: true })
  cityName: string;

  @Column({ nullable: true })
  areaId: string;

  @Column({ nullable: true })
  areaName: string;
}
