import { sanitizeEntityState, sanitizeDiff } from './audit-sanitizer';

describe('AuditSanitizer', () => {
  it('drops unknown fields not in allowlist', () => {
    const raw = {
      id: 'app-1',
      businessName: 'Coffee Shop',
      unknownSecretField: 'secret-val',
      injectedCode: '<script>',
    };
    const sanitized = sanitizeEntityState('merchant_application', raw);
    expect(sanitized).toEqual({
      id: 'app-1',
      businessName: 'Coffee Shop',
    });
    expect(sanitized).not.toHaveProperty('unknownSecretField');
    expect(sanitized).not.toHaveProperty('injectedCode');
  });

  it('redacts sensitive fields (businessTaxId, ownerDateOfBirth)', () => {
    const raw = {
      businessTaxId: '000000001',
      ownerDateOfBirth: '1990-01-01',
      businessName: 'Bakery',
    };
    const sanitized = sanitizeEntityState('merchant_application', raw);
    expect(sanitized?.businessTaxId).toBe('[REDACTED]');
    expect(sanitized?.ownerDateOfBirth).toBe('[REDACTED]');
    expect(sanitized?.businessName).toBe('Bakery');
  });

  it('masks owner email and phone', () => {
    const raw = {
      ownerEmail: 'john.doe@example.com',
      ownerPhone: '+9779800000000',
    };
    const sanitized = sanitizeEntityState('merchant_application', raw);
    expect(sanitized?.ownerEmail).toBe('j***@example.com');
    expect(sanitized?.ownerPhone).toBe('*********0000');
  });

  it('strips global blocklisted keys at any depth (password, token, secret, etc.)', () => {
    const raw = {
      id: 'app-1',
      password: 'password123',
      passwordHash: 'hash',
      token: 'jwt.token',
      nested: {
        secret: 'hidden',
        accessToken: 'bearer',
      },
    };
    const sanitized = sanitizeEntityState('merchant_application', raw);
    expect(sanitized).not.toHaveProperty('password');
    expect(sanitized).not.toHaveProperty('passwordHash');
    expect(sanitized).not.toHaveProperty('token');
  });

  it('diff records changed fields and omits sensitive before/after values', () => {
    const before = {
      businessName: 'Old Shop',
      businessTaxId: '000000001',
      expectedMonthlyVolume: 100000,
    };
    const after = {
      businessName: 'New Shop',
      businessTaxId: '000000002',
      expectedMonthlyVolume: 100000,
    };

    const diff = sanitizeDiff('merchant_application', before, after);
    expect(diff.changedFields).toContain('businessName');
    expect(diff.changedFields).toContain('businessTaxId');
    expect(diff.changedFields).not.toContain('expectedMonthlyVolume');

    // Values of non-sensitive fields are preserved
    expect(diff.before?.businessName).toBe('Old Shop');
    expect(diff.after?.businessName).toBe('New Shop');

    // Sensitive field values are NOT in before/after diff
    expect(diff.before).not.toHaveProperty('businessTaxId');
    expect(diff.after).not.toHaveProperty('businessTaxId');
  });
});
