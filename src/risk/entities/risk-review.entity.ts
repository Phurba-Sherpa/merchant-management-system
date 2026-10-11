import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import {
  RiskLevel,
  RiskReviewStatus,
} from '../../applications/application.enums';
import { MerchantApplication } from '../../applications/entities/merchant-application.entity';

@Entity('risk_reviews')
@Unique('UQ_risk_reviews_application_submission', [
  'applicationId',
  'submissionNumber',
])
export class RiskReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => MerchantApplication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: MerchantApplication;

  @Column({ name: 'submission_number', type: 'int' })
  submissionNumber!: number;

  @Column({
    type: 'enum',
    enum: RiskReviewStatus,
    enumName: 'risk_review_status',
    default: RiskReviewStatus.PENDING,
  })
  status!: RiskReviewStatus;

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: RiskLevel,
    enumName: 'risk_level',
    nullable: true,
  })
  riskLevel?: RiskLevel | null;

  @Column({ name: 'risk_score', type: 'int', nullable: true })
  riskScore?: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  flags!: string[];

  @Column({ name: 'provider_reference', type: 'varchar', nullable: true })
  providerReference?: string | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'enqueued_at', type: 'timestamptz', nullable: true })
  enqueuedAt?: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
