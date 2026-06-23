/**
 * QuantumVault — Canonical Entity Type Definitions
 * ISO 25010 | RBAC | Dual-App Architecture
 * ElePhone (Public Client) + Command Center (Private Admin)
 */

// ─── RBAC ROLES ────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'user';

export interface QVUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_date: string;
}

// ─── TRADING APPLICATION (ElePhone) ────────────────────────────────────────

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type KYCStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

export interface TradingApplication {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  investment_amount: number;
  risk_tolerance: RiskTolerance;
  kyc_status: KYCStatus;
  status: ApplicationStatus;
  /** ADMIN ONLY — never expose to role=user */
  admin_notes?: string;
  approved_by?: string;
  approved_at?: string;
  agreement_signed: boolean;
  agreement_signed_at?: string;
  created_date: string;
}

// ─── TRADING ACCOUNT (ElePhone) ────────────────────────────────────────────

export type TradingAccountStatus = 'inactive' | 'active' | 'suspended' | 'closed';

export interface TradingAccount {
  id: string;
  user_id: string;
  application_id: string;
  account_number: string;
  status: TradingAccountStatus;
  balance_usd: number;
  total_deposited: number;
  total_withdrawn: number;
  auto_trading_enabled: boolean;
  auto_split_enabled: boolean;
  /** Hardcoded: Vanguard 10-yr avg (~10.5%) + 20% = ~12.6% annualized */
  client_return_rate: number;
  last_split_at?: string;
  total_profit_returned: number;
  exchange_keys_linked: boolean;
  created_date: string;
}

// ─── PROFIT SPLIT (RBAC — gross_profit ADMIN ONLY) ─────────────────────────

export interface ProfitSplit {
  id: string;
  trading_account_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  /** ADMIN ONLY — never render for role=user */
  gross_profit?: number;
  /** ADMIN ONLY */
  client_rate?: number;
  /** Only field visible to users */
  client_amount: number;
  status: 'pending' | 'processed' | 'failed';
  processed_at?: string;
  created_date: string;
}

// ─── EXCHANGE KEYS ─────────────────────────────────────────────────────────

export type ExchangeName = 'coinbase' | 'kraken' | 'binance' | 'bybit' | 'okx';

export interface ExchangeKey {
  id: string;
  user_id: string;
  trading_account_id: string;
  exchange: ExchangeName;
  api_key_masked: string;   // ****XXXX
  api_key_hash: string;     // SHA-256 only
  permissions: string[];
  status: 'active' | 'invalid' | 'revoked';
  last_verified?: string;
  label?: string;
  created_date: string;
}

// ─── WALLET ACCOUNT ────────────────────────────────────────────────────────

export interface WalletAccount {
  id: string;
  user_id: string;
  trading_account_id?: string;
  wallet_type: 'custodial' | 'external';
  address?: string;
  chain: 'ethereum' | 'bitcoin' | 'solana' | 'polygon' | 'bnb';
  label?: string;
  balance_usd: number;
  kyc_verified: boolean;
  status: 'active' | 'frozen' | 'pending_kyc';
  created_date: string;
}

// ─── COMMAND CENTER ────────────────────────────────────────────────────────

export interface Strategy {
  id: string;
  name: string;
  type: 'Arbitrage' | 'Market Making' | 'Momentum' | 'Stat Arb' | 'Grid';
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
  targetPair: string;
  riskLimit: number;
  maxPosition: number;
  pnl: number;
  trades: number;
  winRate: number;
  created_date: string;
}

export interface Trade {
  id: string;
  strategy: string;
  pair: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  total: number;
  fee: number;
  txHash?: string;
  status: 'PAPER' | 'FILLED' | 'CANCELLED';
  timestamp: string;
  pnl: number;
  created_date: string;
}

// ─── PROFIT SPLIT BUSINESS LOGIC CONSTANTS ────────────────────────────────
// HARDCODED — not user-configurable

export const PROFIT_SPLIT_CONFIG = {
  VANGUARD_BASELINE_ANNUAL: 0.105,      // 10.5% Vanguard S&P 500 10yr avg
  CLIENT_PREMIUM_ABOVE_VANGUARD: 0.20,  // Client gets 20% more than Vanguard
  CLIENT_ANNUAL_RATE: 0.126,            // 10.5% + (10.5% * 20%) = 12.6%
  CLIENT_MONTHLY_RATE: 0.0105,          // 12.6% / 12
  OPERATOR_KEEPS_REMAINDER: true,       // All excess profit → operator
} as const;

/** Calculate the client's monthly return from gross profit pool */
export function calculateClientReturn(balanceUsd: number): number {
  return balanceUsd * PROFIT_SPLIT_CONFIG.CLIENT_MONTHLY_RATE;
}
