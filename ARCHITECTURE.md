# QuantumVault — Full System Architecture
## ISO 25010 | RBAC | Dual-App | Cloudflare Worker Gateway
### Version: 2.0 | Last Updated: 2026-06-23

---

## SYSTEM OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PUBLIC INTERNET                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   QuantumVault ElePhone  │  PUBLIC — clients only
              │  spectral-quantum-link-  │
              │    core.base44.app       │
              │                          │
              │  Role=user: see own data │
              │  Role=admin: full access │
              └────────────┬────────────┘
                           │ read-only engine summary
                           │ (no CC credentials in bundle)
              ┌────────────▼────────────┐
              │  Cloudflare Worker API   │  GATEWAY — auth + RBAC
              │  quantum-vault-api       │
              │  workers.dev             │
              │                          │
              │  /api/client/*  → RBAC   │
              │  /api/engine/*  → Admin  │
              │  /api/bridge/*  → Server │
              └───────┬────────┬─────────┘
                      │        │
           reads      │        │  writes
        (summary)     │        │  (trade sync)
                      │        │
              ┌───────▼──────┐ │
              │  Command     │ │
              │  Center      │◄┘
              │              │  PRIVATE — admin only
              │  quantum-    │  (you only, never linked
              │  vault-hub   │   from ElePhone)
              │  .base44.app │
              └──────────────┘
```

---

## RBAC MODEL

| Role  | TradingApplication | TradingAccount | ProfitSplit | Strategy | Trade |
|-------|-------------------|----------------|-------------|----------|-------|
| user  | Own only, no admin_notes | Own only | Own only, NO gross_profit | ❌ BLOCKED | ❌ BLOCKED |
| admin | ALL records + all fields | ALL | ALL fields | FULL | FULL |

### Fields PERMANENTLY redacted for role=user:
- `ProfitSplit.gross_profit` — operator's total take
- `ProfitSplit.client_rate` — the rate formula
- `TradingApplication.admin_notes` — your review comments
- `TradingAccount.client_return_rate` — the exact percentage
- `Trade.fee` — fees never shown to clients
- `Strategy.*` — entire entity blocked (CC only)

---

## PROFIT SPLIT MODEL

```
Vanguard S&P 500 10-year annualized average: ~10.5%
Client premium above Vanguard baseline:       +20%
                                               ────
Client annual return rate (hardcoded):         12.6%
Client monthly return rate:                     1.05%

Client return = client_balance × 1.05% per month
Operator take = gross_trading_profit − client_return

Client UI shows: "Your Returns" with dollar amount only.
Client NEVER sees: gross profit, operator take, rate percentage.
Agreement: disclosed in User Agreement as "fee schedule" language.
```

---

## TRADING ACCOUNT APPLICATION FLOW

```
User (ElePhone)                Admin (Command Center)
      │                               │
      ├─ Fill application form        │
      ├─ Sign user agreement          │
      ├─ Submit → status=pending      │
      │                               │
      │                ┌──────────────┤
      │                │ Review in CC │
      │                │ Approve/Reject│
      │                └──────────────┤
      │                               │
      ├─ Notified: approved ──────────┤
      ├─ TradingAccount created       │
      ├─ Add exchange keys            │
      ├─ Add wallets                  │
      └─ Enable auto-trading          │
```

---

## PRODUCT CATALOG (LOCKED)

| Code | Name | Category | Price |
|------|------|----------|-------|
| SIM-NANO | Nano SIM | SIM | $1.00 |
| SIM-ESIM | eSIM | SIM | $1.00 |
| PLN-CALL-5 | Calls Plan | Plan | $5.00 |
| PLN-CT-9 | Calls + Texts Plan | Plan | $9.00 |
| PLN-ALL-13 | All-In-One Plan | Plan | $13.00 |
| ADD-DATA-15 | +15 GB Data Block | Addon | $5.00 |
| KYC-BASIC | KYC Basic | Identity | $0.00 |
| KYC-ADV | KYC Advanced | Identity | $4.99 |
| AI-TOKENS-5 | AI Tokens | Token | $5.00 |

**Valid categories ONLY:** SIM, Plan, Addon, Identity, Token

---

## ENTITY MAP

### ElePhone Entities
| Entity | Purpose | RLS |
|--------|---------|-----|
| User | Auth + role | Built-in |
| Device | Phone activation state | Yes |
| SimCard | SIM record | Yes |
| ActivePlan | Current plan | Yes |
| Wallet (legacy) | Balance | Yes |
| WalletAccount | Multi-chain wallet | Yes |
| AiTokenBalance | Token balance | Yes |
| UserSettings | App settings | Yes |
| Transaction | All financial history | Yes |
| Product | Catalog (read-only) | No |
| Order | Purchase orders | Yes |
| Cart | Shopping cart | Yes |
| TradingApplication | Account application | Yes |
| TradingAccount | Approved trading account | Yes |
| ExchangeKey | Exchange API keys | Yes |
| ProfitSplit | Monthly returns | Yes |

### Command Center Entities (admin only, no path from ElePhone)
| Entity | Purpose |
|--------|---------|
| Strategy | HFT strategies |
| Trade | Executed trades |
| HFTStrategy | Strategy variants |
| RiskControl | Kill switches |
| Asset | Portfolio assets |
| StakingPosition | Staking |
| Vault | Yield vaults |
| InsightSignal | Trade signals |
| Transaction | Internal transfers |

---

## CLOUDFLARE WORKER ROUTES

| Route | Auth | Purpose |
|-------|------|---------|
| GET /health | Public | Uptime check |
| GET /api/client/engine-summary | User JWT | Safe CC summary for ElePhone |
| GET /api/engine/applications | Admin JWT | List pending applications |
| PATCH /api/engine/applications/:id/approve | Admin JWT | Approve trading account |
| PATCH /api/engine/applications/:id/reject | Admin JWT | Reject application |
| POST /api/bridge/sync-trade | CC API Key | Sync trade to ElePhone |

---

## SECURITY CHECKLIST

- [x] CC URL never referenced in ElePhone source code
- [x] CC API key never in ElePhone frontend bundle
- [x] gross_profit field never sent to role=user
- [x] admin_notes field never sent to role=user
- [x] Exchange key secrets: only SHA-256 hash stored, plaintext never persisted
- [x] All monetary operations: KYC gate enforced
- [x] CORS: only ElePhone origin allowed on client API
- [x] Row-level security on all user-data entities
- [ ] TODO: JWT validation in Worker auth middleware
- [ ] TODO: 2FA (TOTP) implementation
- [ ] TODO: SMS verification for SIM activation
- [ ] TODO: Real exchange API key validation

---

## GITHUB REPO STRUCTURE

```
scitizenf-stack/github-mcp-server (rename → quantum-vault-worker)
├── src/
│   ├── types/
│   │   └── entities.ts          Entity type definitions + profit split constants
│   ├── middleware/
│   │   └── rbac.ts              RBAC enforcement, field redaction
│   ├── services/
│   │   ├── profitEngine.ts      Hardcoded split calculation
│   │   └── crossAppBridge.ts    Cross-app integration contract
│   └── worker/
│       └── index.ts             Main CF Worker router
├── ARCHITECTURE.md              This document
├── wrangler.jsonc               CF config
└── package.json
```
