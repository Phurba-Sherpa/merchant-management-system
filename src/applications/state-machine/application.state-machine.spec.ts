import { ApplicationStatus } from '../application.enums';
import {
  nextStatus,
  assertTransition,
  isEditable,
  assertEditable,
  isAssignable,
  assertAssignable,
  ApplicationAction,
} from './application.state-machine';
import {
  ApplicationNotEditableException,
  InvalidStateTransitionException,
} from '../../common/errors/domain.exception';

describe('ApplicationStateMachine', () => {
  describe('Transition Table & nextStatus', () => {
    it('allows DRAFT -> SUBMIT -> SUBMITTED', () => {
      expect(nextStatus(ApplicationStatus.DRAFT, 'SUBMIT')).toBe(
        ApplicationStatus.SUBMITTED,
      );
      expect(assertTransition(ApplicationStatus.DRAFT, 'SUBMIT')).toBe(
        ApplicationStatus.SUBMITTED,
      );
    });

    it('allows SUBMITTED -> RISK_COMPLETED -> IN_REVIEW', () => {
      expect(nextStatus(ApplicationStatus.SUBMITTED, 'RISK_COMPLETED')).toBe(
        ApplicationStatus.IN_REVIEW,
      );
      expect(
        assertTransition(ApplicationStatus.SUBMITTED, 'RISK_COMPLETED'),
      ).toBe(ApplicationStatus.IN_REVIEW);
    });

    it('allows IN_REVIEW decisions (APPROVE, REJECT, REQUEST_INFO)', () => {
      expect(nextStatus(ApplicationStatus.IN_REVIEW, 'APPROVE')).toBe(
        ApplicationStatus.APPROVED,
      );
      expect(nextStatus(ApplicationStatus.IN_REVIEW, 'REJECT')).toBe(
        ApplicationStatus.REJECTED,
      );
      expect(nextStatus(ApplicationStatus.IN_REVIEW, 'REQUEST_INFO')).toBe(
        ApplicationStatus.NEEDS_INFO,
      );
    });

    it('allows NEEDS_INFO -> SUBMIT -> SUBMITTED', () => {
      expect(nextStatus(ApplicationStatus.NEEDS_INFO, 'SUBMIT')).toBe(
        ApplicationStatus.SUBMITTED,
      );
    });

    it('terminal states APPROVED and REJECTED have no transitions', () => {
      const actions: ApplicationAction[] = [
        'SUBMIT',
        'RISK_COMPLETED',
        'APPROVE',
        'REJECT',
        'REQUEST_INFO',
      ];
      for (const action of actions) {
        expect(nextStatus(ApplicationStatus.APPROVED, action)).toBeUndefined();
        expect(nextStatus(ApplicationStatus.REJECTED, action)).toBeUndefined();
        expect(() =>
          assertTransition(ApplicationStatus.APPROVED, action),
        ).toThrow(InvalidStateTransitionException);
        expect(() =>
          assertTransition(ApplicationStatus.REJECTED, action),
        ).toThrow(InvalidStateTransitionException);
      }
    });

    it('throws InvalidStateTransitionException for invalid transitions', () => {
      expect(() =>
        assertTransition(ApplicationStatus.DRAFT, 'APPROVE'),
      ).toThrow(InvalidStateTransitionException);
      expect(() =>
        assertTransition(ApplicationStatus.SUBMITTED, 'SUBMIT'),
      ).toThrow(InvalidStateTransitionException);
      expect(() =>
        assertTransition(ApplicationStatus.IN_REVIEW, 'SUBMIT'),
      ).toThrow(InvalidStateTransitionException);
    });
  });

  describe('isEditable & assertEditable', () => {
    it('identifies DRAFT and NEEDS_INFO as editable', () => {
      expect(isEditable(ApplicationStatus.DRAFT)).toBe(true);
      expect(isEditable(ApplicationStatus.NEEDS_INFO)).toBe(true);
      expect(() => assertEditable(ApplicationStatus.DRAFT)).not.toThrow();
      expect(() => assertEditable(ApplicationStatus.NEEDS_INFO)).not.toThrow();
    });

    it('identifies non-editable statuses and throws ApplicationNotEditableException', () => {
      const nonEditable = [
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.IN_REVIEW,
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
      ];
      for (const status of nonEditable) {
        expect(isEditable(status)).toBe(false);
        expect(() => assertEditable(status)).toThrow(
          ApplicationNotEditableException,
        );
      }
    });
  });

  describe('isAssignable & assertAssignable', () => {
    it('identifies SUBMITTED, IN_REVIEW, NEEDS_INFO as assignable', () => {
      expect(isAssignable(ApplicationStatus.SUBMITTED)).toBe(true);
      expect(isAssignable(ApplicationStatus.IN_REVIEW)).toBe(true);
      expect(isAssignable(ApplicationStatus.NEEDS_INFO)).toBe(true);
      expect(() => assertAssignable(ApplicationStatus.SUBMITTED)).not.toThrow();
      expect(() => assertAssignable(ApplicationStatus.IN_REVIEW)).not.toThrow();
      expect(() =>
        assertAssignable(ApplicationStatus.NEEDS_INFO),
      ).not.toThrow();
    });

    it('rejects DRAFT, APPROVED, REJECTED as not assignable', () => {
      const nonAssignable = [
        ApplicationStatus.DRAFT,
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
      ];
      for (const status of nonAssignable) {
        expect(isAssignable(status)).toBe(false);
        expect(() => assertAssignable(status)).toThrow(
          InvalidStateTransitionException,
        );
      }
    });
  });
});
