import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { InvoiceStatus } from '../enums';
import { Payment } from './index';
import { InvoiceLineItem } from './invoice-line-item.entity';
import { Order } from './order.entity';

@Entity()
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ enum: InvoiceStatus })
  status: string;

  @Column({ nullable: true })
  paypalInvoiceId: string;

  @Column({ nullable: true })
  invoiceNumber: string;

  // @Column({ nullable: true })
  @CreateDateColumn()
  invoiceDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  //? Relations
  @OneToOne(() => Order, (order) => order.invoice)
  @JoinColumn()
  order: Order;

  @OneToOne(() => Payment, (payment) => payment.invoice)
  payment: Payment;

  @OneToMany(
    () => InvoiceLineItem,
    (invoiceLineItem) => invoiceLineItem.invoice,
    {
      cascade: ['update', 'insert'],
    },
  )
  invoiceLineItems: InvoiceLineItem[];
}
