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
export class CashPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  receive: number;

  @Column({ nullable: true })
  change: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  //? Relations
  @OneToOne(() => Payment, (payment) => payment.cashPayment)
  @JoinColumn()
  payment: Payment;
}
