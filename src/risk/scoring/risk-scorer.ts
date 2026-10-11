import {
  BusinessType,
  RiskLevel,
  RiskStatus,
} from '../../applications/application.enums';

export interface RiskAssessmentInput {
  mcc: string;
  businessType: BusinessType;
  hasWebsite: boolean;
  expectedMonthlyVolume: number;
  averageTicketSize: number;
  highestTicketSize: number;
  currency: string;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  riskStatus: RiskStatus;
  flags: string[];
}

export const HIGH_RISK_MCCS = new Set(['7995', '5967', '6051', '4829']);

export function scoreRisk(input: RiskAssessmentInput): RiskAssessment {
  let score = 10; // base score
  const flags: string[] = [];

  if (HIGH_RISK_MCCS.has(input.mcc)) {
    score += 40;
    flags.push('HIGH_RISK_MCC');
  }

  if (input.expectedMonthlyVolume > 5_000_000) {
    score += 20;
    flags.push('HIGH_VOLUME');
  }

  if (input.highestTicketSize > 10 * input.averageTicketSize) {
    score += 15;
    flags.push('TICKET_SPREAD');
  }

  if (!input.hasWebsite) {
    score += 10;
    flags.push('NO_WEBSITE');
  }

  const cappedScore = Math.min(score, 100);

  let level: RiskLevel;
  let riskStatus: RiskStatus;

  if (cappedScore < 30) {
    level = RiskLevel.LOW;
    riskStatus = RiskStatus.CLEAR;
  } else if (cappedScore < 60) {
    level = RiskLevel.MEDIUM;
    riskStatus = RiskStatus.FLAGGED;
  } else {
    level = RiskLevel.HIGH;
    riskStatus = RiskStatus.FLAGGED;
  }

  return {
    score: cappedScore,
    level,
    riskStatus,
    flags,
  };
}
