import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RiskReview } from './entities/risk-review.entity';
import { RISK_PROVIDER } from './risk-provider.interface';
import { SimulatedRiskProvider } from './simulated-risk.provider';
import { RiskReviewProcessor } from './risk-review.processor';
import { RiskReviewRecoveryService } from './risk-review-recovery.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiskReview]),
    BullModule.registerQueue({
      name: 'risk-review',
    }),
    AuditModule,
  ],
  providers: [
    {
      provide: RISK_PROVIDER,
      useClass: SimulatedRiskProvider,
    },
    RiskReviewProcessor,
    RiskReviewRecoveryService,
  ],
  exports: [RISK_PROVIDER, BullModule, TypeOrmModule],
})
export class RiskModule {}
