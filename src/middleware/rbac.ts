/**
 * QuantumVault RBAC Middleware
 * ISO 25010 — Security / Access Control
 *
 * RULES:
 * 1. role=admin → full access to all fields and all records
 * 2. role=user  → own records only (created_by_id === user.id)
 * 3. Certain fields are PERMANENTLY redacted for role=user regardless of ownership
 */

import { QVUser, ProfitSplit, TradingApplication } from '../types/entities';

// Fields that are NEVER sent to role=user — enforced server-side
export const ADMIN_ONLY_FIELDS: Record<string, string[]> = {
  ProfitSplit:        ['gross_profit', 'client_rate'],
  TradingApplication: ['admin_notes', 'approved_by'],
  TradingAccount:     ['client_return_rate'],
  Trade:              ['fee'],            // clients never see fee extraction
  Strategy:           ['*'],             // entire entity blocked from client app
  RiskControl:        ['*'],
};

/**
 * Strip admin-only fields from a record before sending to role=user
 */
export function redactForUser<T extends Record<string, unknown>>(
  entityName: string,
  record: T,
  user: QVUser
): Partial<T> {
  if (user.role === 'admin') return record;

  const blockedFields = ADMIN_ONLY_FIELDS[entityName] || [];

  // Entire entity blocked
  if (blockedFields.includes('*')) {
    throw new RBACError(`Entity ${entityName} is not accessible to role=user`, 403);
  }

  const redacted = { ...record };
  for (const field of blockedFields) {
    delete redacted[field];
  }
  return redacted;
}

/**
 * Enforce row-level security: user can only access their own records
 */
export function assertOwnership(
  record: { user_id?: string; created_by_id?: string },
  user: QVUser
): void {
  if (user.role === 'admin') return; // admins bypass RLS

  const owner = record.user_id || record.created_by_id;
  if (owner && owner !== user.id) {
    throw new RBACError('Access denied: record belongs to another user', 403);
  }
}

/**
 * Validate that a user has an approved trading account before performing trading ops
 */
export function assertTradingApproved(
  applicationStatus: string | undefined,
  user: QVUser
): void {
  if (user.role === 'admin') return;
  if (applicationStatus !== 'approved') {
    throw new RBACError('Trading account not approved. Apply through the ElePhone app.', 403);
  }
}

export class RBACError extends Error {
  constructor(message: string, public statusCode: number = 403) {
    super(message);
    this.name = 'RBACError';
  }
}

/**
 * Build a safe ProfitSplit view for the client (strips operator-internal fields)
 */
export function clientSafeProfitSplit(split: ProfitSplit): Pick<ProfitSplit,
  'id' | 'period_start' | 'period_end' | 'client_amount' | 'status' | 'processed_at' | 'created_date'
> {
  return {
    id: split.id,
    period_start: split.period_start,
    period_end: split.period_end,
    client_amount: split.client_amount,
    status: split.status,
    processed_at: split.processed_at,
    created_date: split.created_date,
    // gross_profit, client_rate intentionally omitted
  };
}

/**
 * Build a safe TradingApplication view for the client
 */
export function clientSafeApplication(app: TradingApplication): Omit<TradingApplication,
  'admin_notes' | 'approved_by'
> {
  const { admin_notes, approved_by, ...safe } = app;
  return safe;
}
