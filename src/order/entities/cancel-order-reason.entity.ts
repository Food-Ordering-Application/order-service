import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Delivery } from '.';
import { ActorType } from '../enums/actor-type.enum';

@Index(['sourceType', 'id'])
@Entity()
export class CancelOrderReason {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ enum: ActorType, nullable: false })
  sourceType: number;

  @Column({ enum: ActorType, nullable: false })
  targetType: number;

  @Column({ nullable: false })
  content: string;

  @Column({ nullable: false, default: -1 })
  @Index()
  displayOrder: number;

  @OneToMany(() => Delivery, (delivery) => delivery.cancelOrderReason)
  deliveries: Delivery[];
}
