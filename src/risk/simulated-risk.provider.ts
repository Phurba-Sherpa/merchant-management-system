import { Injectable, Optional } from '@nestjs/common';
import {
  RiskProvider,
  RiskProviderTransientError,
} from './risk-provider.interface';
import {
  RiskAssessment,
  RiskAssessmentInput,
  scoreRisk,
} from './scoring/risk-scorer';

export interface SimulatedRiskProviderOptions {
  latencyMs?: number;
  failureRate?: number;
  rng?: () => number;
}

@Injectable()
export class SimulatedRiskProvider implements RiskProvider {
  private readonly latencyMs: number;
  private readonly failureRate: number;
  private readonly rng: () => number;

  constructor(@Optional() options?: SimulatedRiskProviderOptions) {
    this.latencyMs =
      options?.latencyMs ??
      parseInt(process.env.RISK_PROVIDER_LATENCY_MS ?? '0', 10);
    this.failureRate =
      options?.failureRate ??
      parseFloat(process.env.RISK_PROVIDER_FAILURE_RATE ?? '0');
    this.rng = options?.rng ?? Math.random;
  }

  async assess(input: RiskAssessmentInput): Promise<RiskAssessment> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    if (this.rng() < this.failureRate) {
      throw new RiskProviderTransientError('Simulated network/provider error');
    }

    return scoreRisk(input);
  }
}
