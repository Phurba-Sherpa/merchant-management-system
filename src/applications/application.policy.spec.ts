import { ApplicationPolicy } from './application.policy';
import { Role } from '../users/role.enum';
import { AuthenticatedUser } from '../common/types/authenticated-user';

describe('ApplicationPolicy', () => {
  let policy: ApplicationPolicy;

  const admin: AuthenticatedUser = { id: 'admin-uuid', role: Role.ADMIN };
  const reviewer: AuthenticatedUser = {
    id: 'reviewer-uuid',
    role: Role.REVIEWER,
  };
  const otherReviewer: AuthenticatedUser = {
    id: 'other-reviewer-uuid',
    role: Role.REVIEWER,
  };
  const sales1: AuthenticatedUser = { id: 'sales1-uuid', role: Role.SALES };
  const sales2: AuthenticatedUser = { id: 'sales2-uuid', role: Role.SALES };

  const appCreatedBySales1 = {
    createdById: sales1.id,
    assignedReviewerId: reviewer.id,
  };

  beforeEach(() => {
    policy = new ApplicationPolicy();
  });

  describe('canView', () => {
    it('ADMIN can view any application', () => {
      expect(policy.canView(admin, appCreatedBySales1)).toBe(true);
    });

    it('REVIEWER can view any application (A1: needs to see the queue)', () => {
      expect(policy.canView(reviewer, appCreatedBySales1)).toBe(true);
      expect(policy.canView(otherReviewer, appCreatedBySales1)).toBe(true);
    });

    it('SALES can view own applications', () => {
      expect(policy.canView(sales1, appCreatedBySales1)).toBe(true);
    });

    it("SALES cannot view another user's application", () => {
      expect(policy.canView(sales2, appCreatedBySales1)).toBe(false);
    });
  });

  describe('canCreate', () => {
    it('ADMIN can create applications', () => {
      expect(policy.canCreate(admin)).toBe(true);
    });

    it('REVIEWER cannot create applications', () => {
      expect(policy.canCreate(reviewer)).toBe(false);
    });

    it('SALES can create applications', () => {
      expect(policy.canCreate(sales1)).toBe(true);
    });
  });

  describe('canEdit', () => {
    it('ADMIN can edit any application', () => {
      expect(policy.canEdit(admin, appCreatedBySales1)).toBe(true);
    });

    it('REVIEWER cannot edit applications', () => {
      expect(policy.canEdit(reviewer, appCreatedBySales1)).toBe(false);
    });

    it('SALES can edit own applications', () => {
      expect(policy.canEdit(sales1, appCreatedBySales1)).toBe(true);
    });

    it("SALES cannot edit another user's applications", () => {
      expect(policy.canEdit(sales2, appCreatedBySales1)).toBe(false);
    });
  });

  describe('canSubmit', () => {
    it('ADMIN can submit any application', () => {
      expect(policy.canSubmit(admin, appCreatedBySales1)).toBe(true);
    });

    it('REVIEWER cannot submit applications', () => {
      expect(policy.canSubmit(reviewer, appCreatedBySales1)).toBe(false);
    });

    it('SALES can submit own applications', () => {
      expect(policy.canSubmit(sales1, appCreatedBySales1)).toBe(true);
    });

    it("SALES cannot submit another user's applications", () => {
      expect(policy.canSubmit(sales2, appCreatedBySales1)).toBe(false);
    });
  });

  describe('canAssign', () => {
    it('Only ADMIN can assign a reviewer (A2)', () => {
      expect(policy.canAssign(admin)).toBe(true);
    });

    it('REVIEWER cannot assign a reviewer', () => {
      expect(policy.canAssign(reviewer)).toBe(false);
    });

    it('SALES cannot assign a reviewer', () => {
      expect(policy.canAssign(sales1)).toBe(false);
    });
  });

  describe('canDecide', () => {
    it('ADMIN cannot record a risk decision (A3)', () => {
      expect(policy.canDecide(admin, appCreatedBySales1)).toBe(false);
    });

    it('REVIEWER can record decision only if assigned to them', () => {
      expect(policy.canDecide(reviewer, appCreatedBySales1)).toBe(true);
    });

    it('REVIEWER cannot record decision if not assigned to them', () => {
      expect(policy.canDecide(otherReviewer, appCreatedBySales1)).toBe(false);
    });

    it('REVIEWER cannot record decision if application has no assignee', () => {
      expect(
        policy.canDecide(reviewer, {
          createdById: sales1.id,
          assignedReviewerId: null,
        }),
      ).toBe(false);
    });

    it('SALES cannot record decisions', () => {
      expect(policy.canDecide(sales1, appCreatedBySales1)).toBe(false);
    });
  });
});
