/**
 * QuantumVault Profit Split Engine
 * HARDCODED business logic — not configurable via UI or API
 *
 * Model:
 * - Client receives: Vanguard S&P 500 10yr avg + 20% premium on their balance
 * - Vanguard 10yr avg (annualized): ~10.5%
 * - Client rate: 10.5% × 1.20 = 12.6% per year = 1.05% per month
 * - Operator retains: all trading profits in EXCESS of client return
 * - Clients never see: gross profit, operator take, or internal rates
 * - Agreement: disclosed in User Agreement at signup (rates described as "fee schedule")
 */

import { PROFIT_SPLIT_CONFIG, TradingAccount } from '../types/entities';

export interface SplitResult {
  /** Amount returned to client — the ONLY number shown in client UI */
  clientAmount: number;
  /** Operator retains this — NEVER sent to client app */
  _operatorAmount: number;
  /** Rate applied — NEVER sent to client app */
  _rateApplied: number;
  /** Period */
  periodStart: string;
  periodEnd: string;
}

/**
 * Calculate monthly profit split for a trading account
 * grossProfit = total trading profit generated this period
 * account.balance_usd = client's principal used for rate calculation
 */
export function calculateMonthlySplit(
  account: TradingAccount,
  grossProfit: number,
  periodStart: string,
  periodEnd: string
): SplitResult {
  const clientAmount = account.balance_usd * PROFIT_SPLIT_CONFIG.CLIENT_MONTHLY_RATE;
  const operatorAmount = Math.max(0, grossProfit - clientAmount);

  return {
    clientAmount: Math.min(clientAmount, grossProfit), // never return more than was earned
    _operatorAmount: operatorAmount,
    _rateApplied: PROFIT_SPLIT_CONFIG.CLIENT_ANNUAL_RATE,
    periodStart,
    periodEnd,
  };
}

/**
 * Human-readable description for the User Agreement
 * This is what users see — rates expressed as "benchmark" language
 */
export const USER_AGREEMENT_RETURN_DESCRIPTION = `
QuantumVault clients receive returns benchmarked to exceed leading index fund 
performance. Actual returns depend on trading conditions and are not guaranteed. 
QuantumVault retains management compensation from trading activity as described 
in the fee schedule. Full terms govern in all cases.
`.trim();

/**
 * What the client sees in their returns history
 * gross_profit and _operatorAmount are NEVER included
 */
export function toClientReturnRecord(split: SplitResult & { id: string; status: string }) {
  return {
    id: split.id,
    period_start: split.periodStart,
    period_end: split.periodEnd,
    amount_returned: split.clientAmount,
    status: split.status,
    // gross_profit: REDACTED
    // _operatorAmount: REDACTED
    // _rateApplied: REDACTED
  };
}
