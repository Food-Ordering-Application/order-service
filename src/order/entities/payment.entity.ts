import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { PaymentMethod, PaymentStatus } from '../enums';
import { CashPayment } from './cash-payment.entity';
import { Invoice } from './invoice.entity';
import { PaypalPayment } from './paypal-payment.entity';
import { ZaloPayPayment } from './zalopay-payment.entity';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ enum: PaymentMethod })
  method: string;

  @Column({ enum: PaymentStatus })
  status: string;

  @Column()
  amount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  //? Relations
  @OneToOne(() => Invoice, (invoice) => invoice.payment)
  @JoinColumn()
  invoice: Invoice;

  @OneToOne(() => PaypalPayment, (paypalPayment) => paypalPayment.payment)
  paypalPayment: PaypalPayment;
  @OneToOne(() => CashPayment, (cashPayment) => cashPayment.payment)
  cashPayment: CashPayment;
  @OneToOne(() => ZaloPayPayment, (zalopayPayment) => zalopayPayment.payment)
  zalopayPayment: ZaloPayPayment;
}
