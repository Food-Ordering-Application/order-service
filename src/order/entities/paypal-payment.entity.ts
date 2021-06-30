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
export class PaypalPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  @Index()
  captureId: string;

  @Column({ nullable: true })
  @Index()
  refundId: string;

  @Column()
  @Index()
  paypalOrderId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  //? Relations
  @OneToOne(() => Payment, (payment) => payment.paypalPayment)
  @JoinColumn()
  payment: Payment;

  @Column({ nullable: true })
  paypalMerchantId: string;
}
