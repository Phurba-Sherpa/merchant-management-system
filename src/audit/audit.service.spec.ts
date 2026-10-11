import { AuditService } from './audit.service';
import { EntityManager } from 'typeorm';

describe('AuditService', () => {
  let auditService: AuditService;
  let mockManager: Partial<EntityManager>;

  beforeEach(() => {
    auditService = new AuditService();
    mockManager = {
      create: jest
        .fn()
        .mockImplementation((_entityClass: any, plain: any): any => plain),
      save: jest
        .fn()
        .mockImplementation((_entityClass: any, entity: any): Promise<any> =>
          Promise.resolve(entity),
        ),
    };
  });

  it('records an audit log with sanitized fields', async () => {
    const result = await auditService.record(mockManager as EntityManager, {
      actor: { type: 'USER', id: 'user-1', role: 'ADMIN' },
      action: 'APPLICATION_CREATED',
      entityType: 'merchant_application',
      entityId: 'app-1',
      after: {
        id: 'app-1',
        businessName: 'Coffee Shop',
        businessTaxId: '000000001',
      },
    });

    expect(mockManager.create).toHaveBeenCalled();
    expect(mockManager.save).toHaveBeenCalled();
    expect(result.actorType).toBe('USER');
    expect(result.actorId).toBe('user-1');
    expect(result.actorRole).toBe('ADMIN');
    expect(result.after?.businessTaxId).toBe('[REDACTED]');
    expect(result.after?.businessName).toBe('Coffee Shop');
  });

  it('records diff between before and after', async () => {
    const result = await auditService.record(mockManager as EntityManager, {
      actor: { type: 'USER', id: 'user-1', role: 'SALES' },
      action: 'APPLICATION_UPDATED',
      entityType: 'merchant_application',
      entityId: 'app-1',
      before: {
        id: 'app-1',
        businessName: 'Old Shop',
        businessTaxId: '000000001',
      },
      after: {
        id: 'app-1',
        businessName: 'New Shop',
        businessTaxId: '000000002',
      },
    });

    expect(result.before?.businessName).toBe('Old Shop');
    expect(result.after?.businessName).toBe('New Shop');
    // sensitive tax id should not have values recorded in diff
    expect(result.before?.businessTaxId).toBeUndefined();
    expect(result.after?.businessTaxId).toBeUndefined();
  });
});
