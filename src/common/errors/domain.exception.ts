import { HttpStatus } from '@nestjs/common';

export class DomainException extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: HttpStatus,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidStateTransitionException extends DomainException {
  constructor(message: string) {
    super('INVALID_STATE_TRANSITION', HttpStatus.CONFLICT, message);
  }
}

export class ApplicationNotEditableException extends DomainException {
  constructor(message = 'Application cannot be edited in its current status') {
    super('APPLICATION_NOT_EDITABLE', HttpStatus.CONFLICT, message);
  }
}

export class ReviewerNotEligibleException extends DomainException {
  constructor(
    message = 'Selected user is not eligible to be assigned as reviewer',
  ) {
    super('REVIEWER_NOT_ELIGIBLE', HttpStatus.BAD_REQUEST, message);
  }
}

export class CommentRequiredException extends DomainException {
  constructor(message = 'Comment is required for this decision') {
    super('COMMENT_REQUIRED', HttpStatus.BAD_REQUEST, message);
  }
}
