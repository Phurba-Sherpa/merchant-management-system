import { maskEmail, maskPhone } from '../common/masking/masking';

const GLOBAL_BLOCKLIST = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'secret',
  'authorization',
  'cookie',
]);

const ALLOWLIST_BY_ENTITY: Record<string, readonly string[]> = {
  merchant_application: [
    'id',
    'businessName',
    'legalBusinessName',
    'businessType',
    'mcc',
    'website',
    'businessTaxId',
    'ownerFirstName',
    'ownerLastName',
    'ownerEmail',
    'ownerPhone',
    'ownerDateOfBirth',
    'expectedMonthlyVolume',
    'averageTicketSize',
    'highestTicketSize',
    'currency',
    'status',
    'riskStatus',
    'submissionCount',
    'createdById',
    'assignedReviewerId',
    'submittedAt',
    'decidedAt',
    'createdAt',
    'updatedAt',
  ],
  risk_review: [
    'id',
    'applicationId',
    'submissionNumber',
    'status',
    'riskLevel',
    'riskScore',
    'flags',
    'providerReference',
    'attempts',
    'lastError',
    'enqueuedAt',
    'startedAt',
    'completedAt',
  ],
  review_decision: [
    'id',
    'applicationId',
    'submissionNumber',
    'reviewerId',
    'decision',
    'comment',
    'createdAt',
  ],
};

const SENSITIVE_FIELDS = new Set(['businessTaxId', 'ownerDateOfBirth']);

function isBlockedKey(key: string): boolean {
  return GLOBAL_BLOCKLIST.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

export function sanitizeEntityState(
  entityType: string,
  state?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!state || typeof state !== 'object') return null;

  const allowlist = ALLOWLIST_BY_ENTITY[entityType];
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(state)) {
    if (isBlockedKey(key)) continue;

    if (allowlist && !allowlist.includes(key)) {
      // deny unknown fields
      continue;
    }

    if (SENSITIVE_FIELDS.has(key)) {
      if (val !== undefined && val !== null) {
        result[key] = '[REDACTED]';
      }
      continue;
    }

    if (key === 'ownerEmail' && typeof val === 'string') {
      result[key] = maskEmail(val);
      continue;
    }

    if (key === 'ownerPhone' && typeof val === 'string') {
      result[key] = maskPhone(val);
      continue;
    }

    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = sanitizeNestedObject(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }

  return result;
}

function sanitizeNestedObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isBlockedKey(key)) continue;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = sanitizeNestedObject(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export function sanitizeDiff(
  entityType: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): {
  changedFields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
} {
  const sanitizedBefore = sanitizeEntityState(entityType, before) ?? {};
  const sanitizedAfter = sanitizeEntityState(entityType, after) ?? {};

  const allKeys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  );

  const changedFields: string[] = [];
  const diffBefore: Record<string, unknown> = {};
  const diffAfter: Record<string, unknown> = {};

  for (const key of allKeys) {
    if (isBlockedKey(key)) continue;
    const allowlist = ALLOWLIST_BY_ENTITY[entityType];
    if (allowlist && !allowlist.includes(key)) continue;

    const valBefore = before?.[key];
    const valAfter = after?.[key];

    if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
      changedFields.push(key);
      if (SENSITIVE_FIELDS.has(key)) {
        // for sensitive fields, record only that they changed; do not output values
      } else {
        diffBefore[key] = sanitizedBefore[key];
        diffAfter[key] = sanitizedAfter[key];
      }
    }
  }

  return {
    changedFields,
    before: Object.keys(diffBefore).length > 0 ? diffBefore : null,
    after: Object.keys(diffAfter).length > 0 ? diffAfter : null,
  };
}
