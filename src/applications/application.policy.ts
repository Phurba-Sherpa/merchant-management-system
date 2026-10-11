import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../users/role.enum';
import { SelectQueryBuilder } from 'typeorm';

export interface ApplicationResource {
  id?: string;
  createdById: string;
  assignedReviewerId?: string | null;
}

export type DecidableApplication = {
  assignedReviewerId?: string | null;
  [key: string]: any;
};

export class ApplicationPolicy {
  /**
   * ADMIN and REVIEWER (A1) can view all applications.
   * SALES can view only their own created applications.
   */
  canView(
    actor: AuthenticatedUser,
    application: { createdById: string },
  ): boolean {
    if (actor.role === Role.ADMIN || actor.role === Role.REVIEWER) {
      return true;
    }
    if (actor.role === Role.SALES) {
      return application.createdById === actor.id;
    }
    return false;
  }

  /**
   * ADMIN and SALES can create applications.
   * REVIEWER cannot create applications.
   */
  canCreate(actor: AuthenticatedUser): boolean {
    return actor.role === Role.ADMIN || actor.role === Role.SALES;
  }

  /**
   * ADMIN can edit any application.
   * SALES can edit only their own applications.
   * REVIEWER cannot edit applications.
   */
  canEdit(
    actor: AuthenticatedUser,
    application: { createdById: string },
  ): boolean {
    if (actor.role === Role.ADMIN) {
      return true;
    }
    if (actor.role === Role.SALES) {
      return application.createdById === actor.id;
    }
    return false;
  }

  /**
   * ADMIN can submit any application.
   * SALES can submit only their own applications.
   * REVIEWER cannot submit applications.
   */
  canSubmit(
    actor: AuthenticatedUser,
    application: { createdById: string },
  ): boolean {
    if (actor.role === Role.ADMIN) {
      return true;
    }
    if (actor.role === Role.SALES) {
      return application.createdById === actor.id;
    }
    return false;
  }

  /**
   * Only ADMIN can assign a reviewer (A2).
   */
  canAssign(actor: AuthenticatedUser): boolean {
    return actor.role === Role.ADMIN;
  }

  /**
   * ADMIN cannot decide (A3: only the assigned REVIEWER can record decisions).
   * REVIEWER can decide ONLY if assigned to them.
   * SALES cannot decide.
   */
  canDecide(
    actor: AuthenticatedUser,
    application: DecidableApplication,
  ): boolean {
    if (actor.role === Role.REVIEWER) {
      return Boolean(
        application.assignedReviewerId &&
        application.assignedReviewerId === actor.id,
      );
    }
    return false;
  }

  /**
   * Scopes queries at database level so SALES never load other users' applications.
   */
  applyVisibilityScope<T extends { createdById?: string }>(
    queryBuilder: SelectQueryBuilder<T>,
    actor: AuthenticatedUser,
    alias = 'application',
  ): SelectQueryBuilder<T> {
    if (actor.role === Role.SALES) {
      return queryBuilder.andWhere(`${alias}.createdById = :actorId`, {
        actorId: actor.id,
      });
    }
    return queryBuilder;
  }
}
