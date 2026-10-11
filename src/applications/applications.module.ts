import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantApplication } from './entities/merchant-application.entity';
import { ReviewDecision } from './entities/review-decision.entity';
import { RiskReview } from '../risk/entities/risk-review.entity';
import { User } from '../users/user.entity';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationPolicy } from './application.policy';
import { AuditModule } from '../audit/audit.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MerchantApplication,
      ReviewDecision,
      RiskReview,
      User,
    ]),
    RiskModule,
    AuditModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationPolicy],
  exports: [ApplicationsService, ApplicationPolicy],
})
export class ApplicationsModule {}
