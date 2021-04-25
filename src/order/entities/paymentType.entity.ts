import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PType } from '../enums';
import { Order } from './order.entity';

@Entity()
export class PaymentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ enum: PType })
  name: string;

  @OneToMany(() => Order, (order) => order.paymentType)
  orders: Order[];
}
