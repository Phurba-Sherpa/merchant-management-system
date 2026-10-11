import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import {
  ApplicationStatus,
  BusinessType,
  RiskStatus,
} from '../application.enums';
import { User } from '../../users/user.entity';
import { ColumnNumericTransformer } from '../../database/transformers/column-numeric.transformer';

@Entity('merchant_applications')
@Check(`"highest_ticket_size" >= "average_ticket_size"`)
@Check(`"expected_monthly_volume" > 0`)
@Check(`"average_ticket_size" > 0`)
@Check(`"highest_ticket_size" > 0`)
@Check(`"submission_count" >= 0`)
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_name', length: 120 })
  businessName!: string;

  @Column({ name: 'legal_business_name', length: 200 })
  legalBusinessName!: string;

  @Column({
    name: 'business_type',
    type: 'enum',
    enum: BusinessType,
    enumName: 'business_type',
  })
  businessType!: BusinessType;

  @Column({ type: 'char', length: 4 })
  mcc!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website?: string | null;

  @Column({
    name: 'business_tax_id',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  businessTaxId?: string | null;

  @Column({ name: 'owner_first_name', length: 80 })
  ownerFirstName!: string;

  @Column({ name: 'owner_last_name', length: 80 })
  ownerLastName!: string;

  @Column({ name: 'owner_email', length: 254 })
  ownerEmail!: string;

  @Column({ name: 'owner_phone', length: 20 })
  ownerPhone!: string;

  @Column({ name: 'owner_date_of_birth', type: 'date', nullable: true })
  ownerDateOfBirth?: string | null;

  @Column({
    name: 'expected_monthly_volume',
    type: 'bigint',
    transformer: new ColumnNumericTransformer(),
  })
  expectedMonthlyVolume!: number;

  @Column({
    name: 'average_ticket_size',
    type: 'bigint',
    transformer: new ColumnNumericTransformer(),
  })
  averageTicketSize!: number;

  @Column({
    name: 'highest_ticket_size',
    type: 'bigint',
    transformer: new ColumnNumericTransformer(),
  })
  highestTicketSize!: number;

  @Column({ type: 'char', length: 3, default: 'USD' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'application_status',
    default: ApplicationStatus.DRAFT,
  })
  status!: ApplicationStatus;

  @Column({
    name: 'risk_status',
    type: 'enum',
    enum: RiskStatus,
    enumName: 'risk_status',
    default: RiskStatus.NOT_STARTED,
  })
  riskStatus!: RiskStatus;

  @Column({ name: 'submission_count', type: 'int', default: 0 })
  submissionCount!: number;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @Column({ name: 'assigned_reviewer_id', type: 'uuid', nullable: true })
  assignedReviewerId?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_reviewer_id' })
  assignedReviewer?: User | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
