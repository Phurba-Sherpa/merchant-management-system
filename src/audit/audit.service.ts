import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { Actor } from './audit.types';
import { AuditAction } from './audit.actions';
import { sanitizeEntityState, sanitizeDiff } from './audit-sanitizer';

export interface RecordAuditParams {
  actor: Actor;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  /**
   * Appends an audit log entry within the provided transaction EntityManager.
   * Exposes no update or delete methods (append-only).
   */
  async record(
    manager: EntityManager,
    params: RecordAuditParams,
  ): Promise<AuditLog> {
    const { actor, action, entityType, entityId, before, after, metadata } =
      params;

    let sanitizedBefore: Record<string, unknown> | null = null;
    let sanitizedAfter: Record<string, unknown> | null = null;

    if (before && after) {
      const diff = sanitizeDiff(entityType, before, after);
      sanitizedBefore = diff.before;
      sanitizedAfter = diff.after;
    } else {
      if (before) {
        sanitizedBefore = sanitizeEntityState(entityType, before);
      }
      if (after) {
        sanitizedAfter = sanitizeEntityState(entityType, after);
      }
    }

    const auditLog = manager.create(AuditLog, {
      actorType: actor.type,
      actorId: actor.type === 'USER' ? actor.id : null,
      actorRole: actor.type === 'USER' ? actor.role : null,
      action,
      entityType,
      entityId,
      before: sanitizedBefore,
      after: sanitizedAfter,
      metadata: metadata ?? {},
    });

    return manager.save(AuditLog, auditLog);
  }
}
