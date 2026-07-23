import { buildEntityLabel, computeDiff } from './audit-diff.js';

describe('computeDiff', () => {
  it('returns an empty diff when nothing changed', () => {
    const entity = { id: '1', tenantId: 't1', name: 'Acme', taxId: '20-111' };
    expect(computeDiff(entity, { ...entity })).toEqual({});
  });

  it('only includes fields that actually differ', () => {
    const before = { id: '1', tenantId: 't1', name: 'Acme', taxId: '20-111', createdAt: new Date() };
    const after = { ...before, taxId: '20-222' };

    expect(computeDiff(before, after)).toEqual({
      taxId: { from: '20-111', to: '20-222' },
    });
  });

  it('excludes denylisted technical fields even when they differ', () => {
    const before = { id: '1', tenantId: 't1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') };
    const after = { id: '1', tenantId: 't1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') };

    expect(computeDiff(before, after)).toEqual({});
  });

  it('excludes any field matching the sensitive-name pattern regardless of the denylist', () => {
    const before = { id: '1', apiSecret: 'old', authToken: 'old', passwordReset: 'old' };
    const after = { id: '1', apiSecret: 'new', authToken: 'new', passwordReset: 'new' };

    expect(computeDiff(before, after)).toEqual({});
  });

  it('treats equal Decimal-like/Date values (via string coercion) as unchanged', () => {
    const before = { id: '1', creditLimit: { toString: () => '100.00' }, dueDate: new Date('2026-05-15') };
    const after = { id: '1', creditLimit: { toString: () => '100.00' }, dueDate: new Date('2026-05-15') };

    expect(computeDiff(before, after)).toEqual({});
  });

  it('renders a create (before: null) as every field going from null', () => {
    const after = { id: '1', tenantId: 't1', name: 'Acme', taxId: '20-111' };

    expect(computeDiff(null, after)).toEqual({
      name: { from: null, to: 'Acme' },
      taxId: { from: null, to: '20-111' },
    });
  });

  it('renders a delete (after: null) as every field going to null', () => {
    const before = { id: '1', tenantId: 't1', name: 'Acme', taxId: '20-111' };

    expect(computeDiff(before, null)).toEqual({
      name: { from: 'Acme', to: null },
      taxId: { from: '20-111', to: null },
    });
  });

  it('returns an empty diff when both before and after are null', () => {
    expect(computeDiff(null, null)).toEqual({});
  });
});

describe('buildEntityLabel', () => {
  it('joins the requested fields with a space', () => {
    expect(buildEntityLabel({ firstName: 'Juan', lastName: 'Pérez' }, ['firstName', 'lastName'])).toBe(
      'Juan Pérez',
    );
  });

  it('skips falsy fields', () => {
    expect(buildEntityLabel({ firstName: 'Juan', lastName: null }, ['firstName', 'lastName'])).toBe('Juan');
  });

  it('returns undefined when there are no labelFields', () => {
    expect(buildEntityLabel({ name: 'Acme' })).toBeUndefined();
  });

  it('returns undefined when the entity is null', () => {
    expect(buildEntityLabel(null, ['name'])).toBeUndefined();
  });
});
