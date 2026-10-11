import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DecisionType } from '../application.enums';
import { MerchantApplication } from './merchant-application.entity';
import { User } from '../../users/user.entity';

@Entity('review_decisions')
@Index('IDX_review_decisions_application_created', [
  'applicationId',
  'createdAt',
])
export class ReviewDecision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => MerchantApplication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: MerchantApplication;

  @Column({ name: 'submission_number', type: 'int' })
  submissionNumber!: number;

  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewer_id' })
  reviewer!: User;

  @Column({
    type: 'enum',
    enum: DecisionType,
    enumName: 'decision_type',
  })
  decision!: DecisionType;

  @Column({ type: 'text', nullable: true })
  comment?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
