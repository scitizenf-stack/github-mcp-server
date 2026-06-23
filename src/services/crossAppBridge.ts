/**
 * QuantumVault Cross-App Integration Bridge
 * Command Center → ElePhone (ONE WAY — client app has NO path back to CC)
 *
 * SECURITY CONTRACT:
 * - ElePhone READS from CC (polling, read-only summary data)
 * - CC WRITES to ElePhone (trade sync, profit splits)
 * - ElePhone has NO admin credentials to the CC internal data
 * - CC API key is stored server-side ONLY — never in ElePhone frontend bundle
 */

// App identifiers
export const APPS = {
  ELEPH_PHONE: {
    id: '6a3abbeb9628775407fdfa73',
    publicUrl: 'https://spectral-quantum-link-core.base44.app',
    apiBase: 'https://spectral-quantum-link-core.base44.app/api',
  },
  COMMAND_CENTER: {
    id: '69f4fd2e2cbf5488116db6f0',
    // URL is intentionally NOT referenced in ElePhone source code
    apiBase: 'https://quantum-vault-hub.base44.app/api',
  },
} as const;

// What ElePhone is ALLOWED to read from CC (public summary only)
export interface CCPublicSummary {
  activeStrategies: number;
  totalStrategies: number;
  engineStatus: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  /** Labelled "Engine Performance" in client UI — NOT "profit" */
  performanceLabel: string;
}

// What CC writes to ElePhone when syncing a completed trade
export interface TradeSyncPayload {
  asset_name: string;        // e.g. "BTC/USDT"
  symbol: string;            // e.g. "BTC"
  type: 'buy' | 'sell';
  quantity: number;
  price_per_unit: number;
  total_amount: number;
  status: 'completed';
  notes: string;             // e.g. "HFT Engine: BTC/USDT Arbitrage Alpha"
  // fee: intentionally EXCLUDED from ElePhone sync
}

/**
 * Build safe summary from CC Strategy list — hides operator-internal PnL detail
 */
export function buildCCPublicSummary(strategies: Array<{ status: string; pnl: number }>): CCPublicSummary {
  const active = strategies.filter(s => s.status === 'ACTIVE').length;
  const totalPnl = strategies.reduce((sum, s) => sum + (s.pnl || 0), 0);

  return {
    activeStrategies: active,
    totalStrategies: strategies.length,
    engineStatus: active > 0 ? 'ONLINE' : 'DEGRADED',
    // Express as neutral performance indicator, not profit amount
    performanceLabel: totalPnl > 0 ? 'Positive' : totalPnl < 0 ? 'Negative' : 'Neutral',
  };
}
