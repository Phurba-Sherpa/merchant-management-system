import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity('audit_logs')
@Index('IDX_audit_logs_entity_occurred', [
  'entityType',
  'entityId',
  'occurredAt',
])
@Index('IDX_audit_logs_actor_id', ['actorId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: ['USER', 'SYSTEM'],
    enumName: 'audit_actor_type',
  })
  actorType!: 'USER' | 'SYSTEM';

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_id' })
  actor?: User | null;

  @Column({ name: 'actor_role', type: 'varchar', nullable: true })
  actorRole?: string | null;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ type: 'jsonb', nullable: true })
  before?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;
}
