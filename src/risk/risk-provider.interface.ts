import { RiskAssessmentInput, RiskAssessment } from './scoring/risk-scorer';

export const RISK_PROVIDER = Symbol('RISK_PROVIDER');

export interface RiskProvider {
  assess(input: RiskAssessmentInput): Promise<RiskAssessment>;
}

export class RiskProviderTransientError extends Error {
  constructor(message = 'Transient risk provider error') {
    super(message);
    this.name = 'RiskProviderTransientError';
  }
}

export class RiskProviderPermanentError extends Error {
  constructor(message = 'Permanent risk provider error') {
    super(message);
    this.name = 'RiskProviderPermanentError';
  }
}
