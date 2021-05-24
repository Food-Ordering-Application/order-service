import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { InvoiceStatus } from '../enums';
import { OrderItem, Invoice } from './index';

@Entity()
export class InvoiceLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ enum: InvoiceStatus })
  status: string;

  @Column({ nullable: true })
  paypalInvoiceId: string;

  @Column({ nullable: true })
  invoiceNumber: string;

  @Column({ nullable: true })
  invoiceDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  //? Relations
  @ManyToOne(() => Invoice, (invoice) => invoice.invoiceLineItems)
  invoice: Invoice;

  @OneToOne(() => OrderItem)
  @JoinColumn()
  orderItem: OrderItem;
}
