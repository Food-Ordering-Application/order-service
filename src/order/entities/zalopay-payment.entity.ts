import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Payment } from './payment.entity';

@Entity()
export class ZaloPayPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  zalopayTransactionId: string;

  @Column()
  zalopayRefundId: string;

  @Column()
  merchantUserId: string;

  @Column({ type: 'int' })
  channel: number;

  @Column({ type: 'bigint' })
  serverTime: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  //? Relations
  @OneToOne(() => Payment, (payment) => payment.paypalPayment)
  @JoinColumn()
  payment: Payment;
}
