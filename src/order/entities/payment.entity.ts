import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { PaymentType, PaymentStatus } from '../enums';
import { Order } from './order.entity';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ enum: PaymentType })
  type: string;

  @Column({ enum: PaymentStatus })
  status: string;

  @Column()
  captureId: string;

  @Column()
  paypalOrderId: string;

  @Column()
  amount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  //? Relations
  @OneToOne(() => Order, (order) => order.payment) // specify inverse side as a second parameter
  @JoinColumn()
  order: Order;
}
