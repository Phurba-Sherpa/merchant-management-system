import { MerchantApplication } from '../entities/merchant-application.entity';
import { RiskReview } from '../../risk/entities/risk-review.entity';
import { ReviewDecision } from '../entities/review-decision.entity';
import { maskTaxId } from '../../common/masking/masking';

export interface ApplicationListItemResponse {
  id: string;
  businessName: string;
  legalBusinessName: string;
  status: string;
  riskStatus: string;
  assignedReviewerId: string | null;
  createdById: string;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationDetailResponse extends ApplicationListItemResponse {
  businessType: string;
  mcc: string;
  website: string | null;
  businessTaxIdMasked: string | null;
  owner: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  processing: {
    expectedMonthlyVolume: number;
    averageTicketSize: number;
    highestTicketSize: number;
    currency: string;
  };
  risk: {
    status: string;
    level: string | null;
    score: number | null;
    flags: string[];
    completedAt: Date | null;
  } | null;
  latestDecision: {
    decision: string;
    comment: string | null;
    reviewerId: string;
    createdAt: Date;
  } | null;
}

export function toApplicationListItem(
  app: MerchantApplication,
): ApplicationListItemResponse {
  return {
    id: app.id,
    businessName: app.businessName,
    legalBusinessName: app.legalBusinessName,
    status: app.status,
    riskStatus: app.riskStatus,
    assignedReviewerId: app.assignedReviewerId ?? null,
    createdById: app.createdById,
    submittedAt: app.submittedAt ?? null,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export function toApplicationDetail(
  app: MerchantApplication,
  latestRiskReview?: RiskReview | null,
  latestDecision?: ReviewDecision | null,
): ApplicationDetailResponse {
  return {
    id: app.id,
    businessName: app.businessName,
    legalBusinessName: app.legalBusinessName,
    status: app.status,
    riskStatus: app.riskStatus,
    assignedReviewerId: app.assignedReviewerId ?? null,
    createdById: app.createdById,
    submittedAt: app.submittedAt ?? null,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    businessType: app.businessType,
    mcc: app.mcc,
    website: app.website ?? null,
    businessTaxIdMasked: maskTaxId(app.businessTaxId),
    owner: {
      firstName: app.ownerFirstName,
      lastName: app.ownerLastName,
      email: app.ownerEmail,
      phone: app.ownerPhone,
    },
    processing: {
      expectedMonthlyVolume: app.expectedMonthlyVolume,
      averageTicketSize: app.averageTicketSize,
      highestTicketSize: app.highestTicketSize,
      currency: app.currency,
    },
    risk: latestRiskReview
      ? {
          status: latestRiskReview.status,
          level: latestRiskReview.riskLevel ?? null,
          score: latestRiskReview.riskScore ?? null,
          flags: latestRiskReview.flags ?? [],
          completedAt: latestRiskReview.completedAt ?? null,
        }
      : null,
    latestDecision: latestDecision
      ? {
          decision: latestDecision.decision,
          comment: latestDecision.comment ?? null,
          reviewerId: latestDecision.reviewerId,
          createdAt: latestDecision.createdAt,
        }
      : null,
  };
}
