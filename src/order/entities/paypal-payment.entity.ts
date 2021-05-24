import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Payment } from './payment.entity';

@Entity()
export class PaypalPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  captureId: string;

  @Column()
  paypalOrderId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  //? Relations
  @OneToOne(() => Payment, (payment) => payment.paypalPayment)
  @JoinColumn()
  payment: Payment;
}
