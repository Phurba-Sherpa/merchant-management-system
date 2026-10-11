import {
  BusinessType,
  RiskLevel,
  RiskStatus,
} from '../../applications/application.enums';
import { scoreRisk, RiskAssessmentInput } from './risk-scorer';

describe('RiskScorer', () => {
  const baseInput: RiskAssessmentInput = {
    mcc: '5411', // normal grocery MCC
    businessType: BusinessType.LLC,
    hasWebsite: true,
    expectedMonthlyVolume: 1_000_000,
    averageTicketSize: 5000,
    highestTicketSize: 10000,
    currency: 'USD',
  };

  it('calculates base risk score for low-risk input', () => {
    const result = scoreRisk(baseInput);
    expect(result.score).toBe(10);
    expect(result.level).toBe(RiskLevel.LOW);
    expect(result.riskStatus).toBe(RiskStatus.CLEAR);
    expect(result.flags).toEqual([]);
  });

  it('adds +40 points for high risk MCC (7995, 5967, 6051, 4829)', () => {
    const result = scoreRisk({ ...baseInput, mcc: '7995' });
    expect(result.score).toBe(50);
    expect(result.level).toBe(RiskLevel.MEDIUM);
    expect(result.riskStatus).toBe(RiskStatus.FLAGGED);
    expect(result.flags).toContain('HIGH_RISK_MCC');
  });

  it('adds +20 points for high volume (> 5,000,000 minor units)', () => {
    const result = scoreRisk({
      ...baseInput,
      expectedMonthlyVolume: 5_000_001,
    });
    expect(result.score).toBe(30);
    expect(result.level).toBe(RiskLevel.MEDIUM);
    expect(result.riskStatus).toBe(RiskStatus.FLAGGED);
    expect(result.flags).toContain('HIGH_VOLUME');
  });

  it('adds +15 points for ticket spread (> 10x average ticket)', () => {
    const result = scoreRisk({
      ...baseInput,
      averageTicketSize: 1000,
      highestTicketSize: 10001,
    });
    expect(result.score).toBe(25);
    expect(result.level).toBe(RiskLevel.LOW);
    expect(result.riskStatus).toBe(RiskStatus.CLEAR);
    expect(result.flags).toContain('TICKET_SPREAD');
  });

  it('adds +10 points when website is absent', () => {
    const result = scoreRisk({ ...baseInput, hasWebsite: false });
    expect(result.score).toBe(20);
    expect(result.level).toBe(RiskLevel.LOW);
    expect(result.riskStatus).toBe(RiskStatus.CLEAR);
    expect(result.flags).toContain('NO_WEBSITE');
  });

  it('caps score at 100 and classifies as HIGH', () => {
    const result = scoreRisk({
      ...baseInput,
      mcc: '6051', // +40
      expectedMonthlyVolume: 10_000_000, // +20
      averageTicketSize: 1000,
      highestTicketSize: 20000, // +15
      hasWebsite: false, // +10
      // 10 base + 40 + 20 + 15 + 10 = 95
    });
    expect(result.score).toBe(95);
    expect(result.level).toBe(RiskLevel.HIGH);
    expect(result.riskStatus).toBe(RiskStatus.FLAGGED);
    expect(result.flags).toEqual([
      'HIGH_RISK_MCC',
      'HIGH_VOLUME',
      'TICKET_SPREAD',
      'NO_WEBSITE',
    ]);
  });

  it('tests level boundaries: 29 is LOW, 30 is MEDIUM, 59 is MEDIUM, 60 is HIGH', () => {
    // Score 25 (< 30) -> LOW, CLEAR
    const low = scoreRisk({
      ...baseInput,
      averageTicketSize: 1000,
      highestTicketSize: 15000,
    });
    expect(low.score).toBe(25);
    expect(low.level).toBe(RiskLevel.LOW);
    expect(low.riskStatus).toBe(RiskStatus.CLEAR);

    // Score 30 (10 + 20) -> MEDIUM, FLAGGED
    const medium30 = scoreRisk({
      ...baseInput,
      expectedMonthlyVolume: 6_000_000,
    });
    expect(medium30.score).toBe(30);
    expect(medium30.level).toBe(RiskLevel.MEDIUM);
    expect(medium30.riskStatus).toBe(RiskStatus.FLAGGED);

    // Score 60 (10 + 40 + 10) -> HIGH, FLAGGED
    const high60 = scoreRisk({
      ...baseInput,
      mcc: '7995',
      hasWebsite: false,
    });
    expect(high60.score).toBe(60);
    expect(high60.level).toBe(RiskLevel.HIGH);
    expect(high60.riskStatus).toBe(RiskStatus.FLAGGED);
  });
});
