import { ApplicationStatus } from '../application.enums';
import {
  ApplicationNotEditableException,
  InvalidStateTransitionException,
} from '../../common/errors/domain.exception';

export type ApplicationAction =
  'SUBMIT' | 'RISK_COMPLETED' | 'APPROVE' | 'REJECT' | 'REQUEST_INFO';

export const TRANSITIONS: Record<
  ApplicationStatus,
  Partial<Record<ApplicationAction, ApplicationStatus>>
> = {
  [ApplicationStatus.DRAFT]: {
    SUBMIT: ApplicationStatus.SUBMITTED,
  },
  [ApplicationStatus.SUBMITTED]: {
    RISK_COMPLETED: ApplicationStatus.IN_REVIEW,
  },
  [ApplicationStatus.IN_REVIEW]: {
    APPROVE: ApplicationStatus.APPROVED,
    REJECT: ApplicationStatus.REJECTED,
    REQUEST_INFO: ApplicationStatus.NEEDS_INFO,
  },
  [ApplicationStatus.NEEDS_INFO]: {
    SUBMIT: ApplicationStatus.SUBMITTED,
  },
  [ApplicationStatus.APPROVED]: {},
  [ApplicationStatus.REJECTED]: {},
};

export const EDITABLE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.NEEDS_INFO,
];

export const ASSIGNABLE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.IN_REVIEW,
  ApplicationStatus.NEEDS_INFO,
];

export function nextStatus(
  current: ApplicationStatus,
  action: ApplicationAction,
): ApplicationStatus | undefined {
  return TRANSITIONS[current]?.[action];
}

export function assertTransition(
  current: ApplicationStatus,
  action: ApplicationAction,
): ApplicationStatus {
  const next = nextStatus(current, action);
  if (!next) {
    throw new InvalidStateTransitionException(
      `Cannot perform action ${action} on application in status ${current}`,
    );
  }
  return next;
}

export function isEditable(status: ApplicationStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function assertEditable(status: ApplicationStatus): void {
  if (!isEditable(status)) {
    throw new ApplicationNotEditableException(
      `Cannot edit application in status ${status}`,
    );
  }
}

export function isAssignable(status: ApplicationStatus): boolean {
  return ASSIGNABLE_STATUSES.includes(status);
}

export function assertAssignable(status: ApplicationStatus): void {
  if (!isAssignable(status)) {
    throw new InvalidStateTransitionException(
      `Cannot assign reviewer to application in status ${status}`,
    );
  }
}
