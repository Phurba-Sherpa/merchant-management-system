import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { MerchantApplication } from './entities/merchant-application.entity';
import { RiskReview } from '../risk/entities/risk-review.entity';
import { ReviewDecision } from './entities/review-decision.entity';
import { ApplicationPolicy } from './application.policy';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import {
  QueryApplicationsDto,
  SORT_COLUMN_MAP,
} from './dto/query-applications.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { RecordDecisionDto } from './dto/record-decision.dto';
import {
  ApplicationStatus,
  DecisionType,
  RiskLevel,
  RiskReviewStatus,
  RiskStatus,
} from './application.enums';
import {
  assertTransition,
  assertEditable,
  assertAssignable,
} from './state-machine/application.state-machine';
import {
  CommentRequiredException,
  ReviewerNotEligibleException,
} from '../common/errors/domain.exception';
import { User } from '../users/user.entity';
import { Role } from '../users/role.enum';
import {
  toApplicationDetail,
  toApplicationListItem,
} from './mappers/application.mapper';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RiskJobPayload } from '../risk/risk-job.payload';
import { Logger } from '@nestjs/common';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MerchantApplication)
    private readonly appRepo: Repository<MerchantApplication>,
    @InjectRepository(RiskReview)
    private readonly riskReviewRepo: Repository<RiskReview>,
    @InjectRepository(ReviewDecision)
    private readonly decisionRepo: Repository<ReviewDecision>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectQueue('risk-review')
    private readonly riskQueue: Queue<RiskJobPayload>,
    private readonly applicationPolicy: ApplicationPolicy,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Helper to load an application row with pessimistic lock and visibility scope.
   */
  private async lockApplication(
    manager: EntityManager,
    id: string,
    user: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    const qb = manager
      .createQueryBuilder(MerchantApplication, 'app')
      .setLock('pessimistic_write')
      .where('app.id = :id', { id });

    if (user.role === Role.SALES) {
      qb.andWhere('app.createdById = :userId', { userId: user.id });
    }

    const application = await qb.getOne();
    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    return application;
  }

  /**
   * Create DRAFT application
   */
  async create(dto: CreateApplicationDto, user: AuthenticatedUser) {
    if (!this.applicationPolicy.canCreate(user)) {
      throw new ForbiddenException('Not authorized to create applications');
    }

    // Validate cross-field rules
    if (dto.processing.highestTicketSize < dto.processing.averageTicketSize) {
      throw new BadRequestException(
        'highestTicketSize must be greater than or equal to averageTicketSize',
      );
    }
    if (
      dto.processing.expectedMonthlyVolume < dto.processing.averageTicketSize
    ) {
      throw new BadRequestException(
        'expectedMonthlyVolume must be greater than or equal to averageTicketSize',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const app = manager.create(MerchantApplication, {
        businessName: dto.businessName.trim(),
        legalBusinessName: dto.legalBusinessName.trim(),
        businessType: dto.businessType,
        mcc: dto.mcc,
        website: dto.website?.trim(),
        businessTaxId: dto.businessTaxId?.trim(),
        ownerFirstName: dto.owner.firstName.trim(),
        ownerLastName: dto.owner.lastName.trim(),
        ownerEmail: dto.owner.email.trim().toLowerCase(),
        ownerPhone: dto.owner.phone.trim(),
        ownerDateOfBirth: dto.owner.dateOfBirth,
        expectedMonthlyVolume: dto.processing.expectedMonthlyVolume,
        averageTicketSize: dto.processing.averageTicketSize,
        highestTicketSize: dto.processing.highestTicketSize,
        currency: dto.processing.currency ?? 'USD',
        status: ApplicationStatus.DRAFT,
        riskStatus: RiskStatus.NOT_STARTED,
        submissionCount: 0,
        createdById: user.id,
      });

      const saved = await manager.save(MerchantApplication, app);

      await this.auditService.record(manager, {
        actor: { type: 'USER', id: user.id, role: user.role },
        action: AUDIT_ACTIONS.APPLICATION_CREATED,
        entityType: 'merchant_application',
        entityId: saved.id,
        after: saved as unknown as Record<string, unknown>,
      });

      return toApplicationDetail(saved);
    });
  }

  /**
   * List applications with visibility scope, filter, sorting, and pagination
   */
  async list(query: QueryApplicationsDto, user: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortField = query.sort ?? 'createdAt';
    const sortOrder = (query.order?.toUpperCase() ?? 'DESC') as 'ASC' | 'DESC';

    const qb = this.appRepo.createQueryBuilder('application');

    // Scoping layer
    this.applicationPolicy.applyVisibilityScope(qb, user, 'application');

    if (query.status) {
      qb.andWhere('application.status = :status', { status: query.status });
    }
    if (query.riskStatus) {
      qb.andWhere('application.riskStatus = :riskStatus', {
        riskStatus: query.riskStatus,
      });
    }
    if (query.assignedReviewerId) {
      qb.andWhere('application.assignedReviewerId = :assignedReviewerId', {
        assignedReviewerId: query.assignedReviewerId,
      });
    }

    const columnOrder = SORT_COLUMN_MAP[sortField] ?? 'application.createdAt';
    qb.orderBy(columnOrder, sortOrder)
      .addOrderBy('application.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map(toApplicationListItem),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get application detail
   */
  async getOne(id: string, user: AuthenticatedUser) {
    const qb = this.appRepo
      .createQueryBuilder('application')
      .where('application.id = :id', { id });

    this.applicationPolicy.applyVisibilityScope(qb, user, 'application');

    const app = await qb.getOne();
    if (!app) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    if (!this.applicationPolicy.canView(user, app)) {
      throw new ForbiddenException();
    }

    const latestRiskReview = await this.riskReviewRepo.findOne({
      where: {
        applicationId: app.id,
        submissionNumber: app.submissionCount,
      },
    });

    const latestDecision = await this.decisionRepo.findOne({
      where: {
        applicationId: app.id,
      },
      order: { createdAt: 'DESC' },
    });

    return toApplicationDetail(app, latestRiskReview, latestDecision);
  }

  /**
   * Partial update
   */
  async update(id: string, dto: UpdateApplicationDto, user: AuthenticatedUser) {
    return this.dataSource.transaction(async (manager) => {
      // 1. Lock with visibility scope (SALES: AND created_by_id = :userId -> 404)
      const app = await this.lockApplication(manager, id, user);

      // 2. Authz
      if (!this.applicationPolicy.canEdit(user, app)) {
        throw new ForbiddenException();
      }

      // 3. State check
      assertEditable(app.status);

      // Merge and validate cross-field rules
      const mergedHighest =
        dto.processing?.highestTicketSize ?? app.highestTicketSize;
      const mergedAverage =
        dto.processing?.averageTicketSize ?? app.averageTicketSize;
      const mergedVolume =
        dto.processing?.expectedMonthlyVolume ?? app.expectedMonthlyVolume;

      if (mergedHighest < mergedAverage) {
        throw new BadRequestException(
          'highestTicketSize must be greater than or equal to averageTicketSize',
        );
      }
      if (mergedVolume < mergedAverage) {
        throw new BadRequestException(
          'expectedMonthlyVolume must be greater than or equal to averageTicketSize',
        );
      }

      const beforeState = { ...app };

      if (dto.businessName !== undefined) {
        app.businessName = dto.businessName.trim();
      }
      if (dto.legalBusinessName !== undefined) {
        app.legalBusinessName = dto.legalBusinessName.trim();
      }
      if (dto.businessType !== undefined) {
        app.businessType = dto.businessType;
      }
      if (dto.mcc !== undefined) {
        app.mcc = dto.mcc;
      }
      if (dto.website !== undefined) {
        app.website = dto.website?.trim() ?? null;
      }
      if (dto.businessTaxId !== undefined) {
        app.businessTaxId = dto.businessTaxId?.trim() ?? null;
      }
      if (dto.owner) {
        if (dto.owner.firstName !== undefined)
          app.ownerFirstName = dto.owner.firstName.trim();
        if (dto.owner.lastName !== undefined)
          app.ownerLastName = dto.owner.lastName.trim();
        if (dto.owner.email !== undefined)
          app.ownerEmail = dto.owner.email.trim().toLowerCase();
        if (dto.owner.phone !== undefined)
          app.ownerPhone = dto.owner.phone.trim();
        if (dto.owner.dateOfBirth !== undefined)
          app.ownerDateOfBirth = dto.owner.dateOfBirth;
      }
      if (dto.processing) {
        if (dto.processing.expectedMonthlyVolume !== undefined)
          app.expectedMonthlyVolume = dto.processing.expectedMonthlyVolume;
        if (dto.processing.averageTicketSize !== undefined)
          app.averageTicketSize = dto.processing.averageTicketSize;
        if (dto.processing.highestTicketSize !== undefined)
          app.highestTicketSize = dto.processing.highestTicketSize;
        if (dto.processing.currency !== undefined)
          app.currency = dto.processing.currency;
      }

      const saved = await manager.save(MerchantApplication, app);

      await this.auditService.record(manager, {
        actor: { type: 'USER', id: user.id, role: user.role },
        action: AUDIT_ACTIONS.APPLICATION_UPDATED,
        entityType: 'merchant_application',
        entityId: saved.id,
        before: beforeState,
        after: saved as unknown as Record<string, unknown>,
      });

      return toApplicationDetail(saved);
    });
  }

  /**
   * Submit application: lock -> authz -> check state -> mutate -> audit -> commit -> enqueue
   */
  async submit(id: string, user: AuthenticatedUser) {
    let enqueuedJobData: {
      applicationId: string;
      submissionNumber: number;
      riskReviewId: string;
    } | null = null;

    await this.dataSource.transaction(async (manager) => {
      // 1. Lock with visibility scope (SALES: AND created_by_id = :userId -> 404)
      const app = await this.lockApplication(manager, id, user);

      // 2. Authz
      if (!this.applicationPolicy.canSubmit(user, app)) {
        throw new ForbiddenException();
      }

      // 3. State check
      const nextAppState = assertTransition(app.status, 'SUBMIT');

      // 4. Mutate
      const beforeState = { ...app };
      const newSubmissionCount = app.submissionCount + 1;
      app.status = nextAppState;
      app.riskStatus = RiskStatus.PENDING;
      app.submissionCount = newSubmissionCount;
      app.submittedAt = new Date();

      const savedApp = await manager.save(MerchantApplication, app);

      const riskReview = manager.create(RiskReview, {
        applicationId: savedApp.id,
        submissionNumber: newSubmissionCount,
        status: RiskReviewStatus.PENDING,
      });
      const savedReview = await manager.save(RiskReview, riskReview);

      // 5. Audit
      await this.auditService.record(manager, {
        actor: { type: 'USER', id: user.id, role: user.role },
        action: AUDIT_ACTIONS.APPLICATION_SUBMITTED,
        entityType: 'merchant_application',
        entityId: savedApp.id,
        before: beforeState,
        after: savedApp as unknown as Record<string, unknown>,
        metadata: { submissionNumber: newSubmissionCount },
      });

      enqueuedJobData = {
        applicationId: savedApp.id,
        submissionNumber: newSubmissionCount,
        riskReviewId: savedReview.id,
      };
    });

    // Enqueue AFTER commit
    if (enqueuedJobData !== null) {
      const data: {
        applicationId: string;
        submissionNumber: number;
        riskReviewId: string;
      } = enqueuedJobData;
      const { applicationId, submissionNumber, riskReviewId } = data;
      const jobId = `risk-review-${applicationId}-${submissionNumber}`;
      const attempts = parseInt(process.env.RISK_RETRY_ATTEMPTS ?? '5', 10);
      const backoffDelay = parseInt(
        process.env.RISK_BACKOFF_DELAY ?? '2000',
        10,
      );

      try {
        await this.riskQueue.add(
          'assess',
          { applicationId, submissionNumber, riskReviewId },
          {
            jobId,
            attempts,
            backoff: { type: 'exponential', delay: backoffDelay },
            removeOnComplete: { age: 86400, count: 1000 },
            removeOnFail: false,
          },
        );

        await this.riskReviewRepo.update(
          { id: riskReviewId },
          { enqueuedAt: new Date() },
        );
      } catch (err: unknown) {
        this.logger.error(
          `Failed to enqueue risk review for app ${String(id)}`,
          err instanceof Error ? err.stack : undefined,
        );
        // Still return 202; recovery service will enqueue it
      }
    }

    return {
      message: 'Application submitted for risk review',
      applicationId: id,
      status: ApplicationStatus.SUBMITTED,
      riskStatus: RiskStatus.PENDING,
    };
  }

  /**
   * Assign reviewer (ADMIN only)
   */
  async assign(id: string, dto: AssignReviewerDto, user: AuthenticatedUser) {
    return this.dataSource.transaction(async (manager) => {
      // 1. Lock
      const app = await this.lockApplication(manager, id, user);

      // 2. Authz
      if (!this.applicationPolicy.canAssign(user)) {
        throw new ForbiddenException();
      }

      // 3. State check
      assertAssignable(app.status);

      // 4. Validate reviewer eligibility
      const targetReviewer = await this.userRepo.findOne({
        where: { id: dto.reviewerId },
      });

      if (
        !targetReviewer ||
        targetReviewer.role !== Role.REVIEWER ||
        !targetReviewer.isActive
      ) {
        throw new ReviewerNotEligibleException(
          'Target user is not an active reviewer',
        );
      }

      const beforeState = { ...app };
      app.assignedReviewerId = targetReviewer.id;
      const saved = await manager.save(MerchantApplication, app);

      await this.auditService.record(manager, {
        actor: { type: 'USER', id: user.id, role: user.role },
        action: AUDIT_ACTIONS.REVIEWER_ASSIGNED,
        entityType: 'merchant_application',
        entityId: saved.id,
        before: beforeState,
        after: saved as unknown as Record<string, unknown>,
        metadata: { reviewerId: targetReviewer.id },
      });

      return toApplicationDetail(saved);
    });
  }

  /**
   * Record decision (Assigned REVIEWER only)
   */
  async recordDecision(
    id: string,
    dto: RecordDecisionDto,
    user: AuthenticatedUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      // 1. Lock application
      const app = await this.lockApplication(manager, id, user);

      // 2. Authz: check policy FIRST (assigned reviewer check -> 403)
      if (!this.applicationPolicy.canDecide(user, app)) {
        throw new ForbiddenException(
          'Only the assigned reviewer can record a decision',
        );
      }

      // 3. State check
      let action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO';
      if (dto.decision === DecisionType.APPROVE) action = 'APPROVE';
      else if (dto.decision === DecisionType.REJECT) action = 'REJECT';
      else action = 'REQUEST_INFO';

      const nextAppState = assertTransition(app.status, action);

      // Load latest risk review for comment rules
      const latestRiskReview = await manager.findOne(RiskReview, {
        where: {
          applicationId: app.id,
          submissionNumber: app.submissionCount,
        },
      });

      // 4. Validate comment requirements
      const comment = dto.comment?.trim();
      if (
        (dto.decision === DecisionType.REJECT ||
          dto.decision === DecisionType.REQUEST_INFO) &&
        (!comment || comment.length < 10)
      ) {
        throw new CommentRequiredException(
          `A comment of at least 10 characters is required for ${dto.decision}`,
        );
      }

      if (
        dto.decision === DecisionType.APPROVE &&
        latestRiskReview?.riskLevel === RiskLevel.HIGH &&
        (!comment || comment.length < 10)
      ) {
        throw new CommentRequiredException(
          'A comment of at least 10 characters is required when approving HIGH risk applications',
        );
      }

      // 5. Mutate
      const beforeState = { ...app };
      app.status = nextAppState;
      if (
        nextAppState === ApplicationStatus.APPROVED ||
        nextAppState === ApplicationStatus.REJECTED
      ) {
        app.decidedAt = new Date();
      }

      const savedApp = await manager.save(MerchantApplication, app);

      const decisionEntity = manager.create(ReviewDecision, {
        applicationId: app.id,
        submissionNumber: app.submissionCount,
        reviewerId: user.id,
        decision: dto.decision,
        comment: comment ?? null,
      });
      const savedDecision = await manager.save(ReviewDecision, decisionEntity);

      // 6. Audit
      await this.auditService.record(manager, {
        actor: { type: 'USER', id: user.id, role: user.role },
        action: AUDIT_ACTIONS.DECISION_RECORDED,
        entityType: 'merchant_application',
        entityId: savedApp.id,
        before: beforeState,
        after: savedApp as unknown as Record<string, unknown>,
        metadata: {
          decision: dto.decision,
          submissionNumber: app.submissionCount,
        },
      });

      return {
        id: savedDecision.id,
        applicationId: savedDecision.applicationId,
        decision: savedDecision.decision,
        comment: savedDecision.comment,
        reviewerId: savedDecision.reviewerId,
        createdAt: savedDecision.createdAt,
      };
    });
  }

  /**
   * Get decision history for an application
   */
  async getDecisions(id: string, user: AuthenticatedUser) {
    const qb = this.appRepo
      .createQueryBuilder('app')
      .where('app.id = :id', { id });

    this.applicationPolicy.applyVisibilityScope(qb, user, 'app');
    const app = await qb.getOne();
    if (!app) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    if (!this.applicationPolicy.canView(user, app)) {
      throw new ForbiddenException();
    }

    return this.decisionRepo.find({
      where: { applicationId: id },
      order: { createdAt: 'DESC' },
    });
  }
}
