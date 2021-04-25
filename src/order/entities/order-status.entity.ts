import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Status } from '../enums';
import { Order } from './order.entity';

@Entity()
export class OrderStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ enum: Status })
  name: string;

  @OneToMany(() => Order, (order) => order.status)
  orders: Order[];
}
