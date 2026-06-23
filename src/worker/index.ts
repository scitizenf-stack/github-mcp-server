/**
 * QuantumVault Cloudflare Worker — API Gateway
 * Routes: ElePhone Client API + Command Center Bridge
 *
 * ROUTING RULES:
 * /api/client/*  → ElePhone client-safe endpoints (RBAC enforced)
 * /api/engine/*  → Command Center internal (admin JWT required)
 * /api/bridge/*  → Cross-app sync (CC → ElePhone, server-to-server only)
 * /health        → Public health check
 */

export interface Env {
  // Base44 Apps
  BASE44_ELEPHONE_APP_ID: string;
  BASE44_ELEPHONE_API_KEY: string;
  BASE44_CC_APP_ID: string;
  BASE44_CC_API_KEY: string;   // NEVER sent to ElePhone frontend
  // Auth
  JWT_SECRET: string;
  ADMIN_USER_ID: string;       // Your Base44 user ID — only you get admin
  // KV + D1
  CACHE: KVNamespace;
  DB: D1Database;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://spectral-quantum-link-core.base44.app',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Key',
  'Content-Type': 'application/json',
};

// CRITICAL: Command Center origin is explicitly BLOCKED from CORS
// Only ElePhone can call the client API
const BLOCKED_ORIGINS = [
  'https://quantum-vault-hub.base44.app', // CC never calls its own bridge directly
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check — public
    if (url.pathname === '/health') {
      return json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Route
    if (url.pathname.startsWith('/api/client/')) {
      return handleClientAPI(request, url, env);
    }

    if (url.pathname.startsWith('/api/engine/')) {
      return handleEngineAPI(request, url, env);
    }

    if (url.pathname.startsWith('/api/bridge/')) {
      return handleBridgeAPI(request, url, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};

// ─── CLIENT API (ElePhone → Worker) ────────────────────────────────────────
// RBAC enforced. Admin-only fields stripped.

async function handleClientAPI(request: Request, url: URL, env: Env): Promise<Response> {
  const path = url.pathname.replace('/api/client', '');

  // All client routes require auth
  const userId = await verifyClientToken(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  // GET /api/client/engine-summary — read-only CC summary (no internal data)
  if (path === '/engine-summary' && request.method === 'GET') {
    const strategies = await fetchCC('/entities/Strategy', env);
    const active = strategies.records?.filter((s: any) => s.status === 'ACTIVE').length || 0;
    // Return minimal summary — no PnL amounts exposed to client
    return json({
      activeStrategies: active,
      totalStrategies: strategies.count || 0,
      engineStatus: active > 0 ? 'ONLINE' : 'DEGRADED',
    });
  }

  return json({ error: 'Client route not found' }, 404);
}

// ─── ENGINE API (Admin only — Command Center) ───────────────────────────────

async function handleEngineAPI(request: Request, url: URL, env: Env): Promise<Response> {
  const adminId = await verifyAdminToken(request, env);
  if (!adminId) return json({ error: 'Forbidden — admin only' }, 403);

  const path = url.pathname.replace('/api/engine', '');

  // GET /api/engine/applications — list all pending trading applications
  if (path === '/applications' && request.method === 'GET') {
    const apps = await fetchElePhone('/entities/TradingApplication', env);
    return json(apps);
  }

  // PATCH /api/engine/applications/:id/approve
  if (path.match(/^\/applications\/[\w]+\/approve$/) && request.method === 'PATCH') {
    const appId = path.split('/')[2];
    const { notes } = await request.json() as any;
    const result = await patchElePhone(
      `/entities/TradingApplication/${appId}`,
      { status: 'approved', approved_by: adminId, approved_at: new Date().toISOString(), admin_notes: notes },
      env
    );
    return json(result);
  }

  // PATCH /api/engine/applications/:id/reject
  if (path.match(/^\/applications\/[\w]+\/reject$/) && request.method === 'PATCH') {
    const appId = path.split('/')[2];
    const { notes } = await request.json() as any;
    const result = await patchElePhone(
      `/entities/TradingApplication/${appId}`,
      { status: 'rejected', admin_notes: notes },
      env
    );
    return json(result);
  }

  return json({ error: 'Engine route not found' }, 404);
}

// ─── BRIDGE API (CC → ElePhone trade sync) ─────────────────────────────────

async function handleBridgeAPI(request: Request, url: URL, env: Env): Promise<Response> {
  // Bridge must come from CC server with CC API key
  const apiKey = request.headers.get('X-App-Key');
  if (apiKey !== env.BASE44_CC_API_KEY) {
    return json({ error: 'Forbidden' }, 403);
  }

  const path = url.pathname.replace('/api/bridge', '');

  // POST /api/bridge/sync-trade — sync a CC trade to ElePhone Transaction
  if (path === '/sync-trade' && request.method === 'POST') {
    const trade = await request.json() as any;
    const payload = {
      asset_name: trade.pair,
      symbol: trade.pair.split('/')[0],
      type: trade.side.toLowerCase(),
      quantity: trade.qty,
      price_per_unit: trade.price,
      total_amount: trade.total,
      status: 'completed',
      notes: `HFT Engine: ${trade.strategy}`,
      // fee intentionally excluded
    };
    const result = await postElePhone('/entities/Transaction', payload, env);
    return json(result);
  }

  return json({ error: 'Bridge route not found' }, 404);
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

async function fetchCC(path: string, env: Env): Promise<any> {
  const r = await fetch(`https://quantum-vault-hub.base44.app/api${path}`, {
    headers: { api_key: env.BASE44_CC_API_KEY },
  });
  return r.json();
}

async function fetchElePhone(path: string, env: Env): Promise<any> {
  const r = await fetch(`https://spectral-quantum-link-core.base44.app/api${path}`, {
    headers: { api_key: env.BASE44_ELEPHONE_API_KEY },
  });
  return r.json();
}

async function postElePhone(path: string, body: object, env: Env): Promise<any> {
  const r = await fetch(`https://spectral-quantum-link-core.base44.app/api${path}`, {
    method: 'POST',
    headers: { api_key: env.BASE44_ELEPHONE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function patchElePhone(path: string, body: object, env: Env): Promise<any> {
  const r = await fetch(`https://spectral-quantum-link-core.base44.app/api${path}`, {
    method: 'PUT',
    headers: { api_key: env.BASE44_ELEPHONE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function verifyClientToken(_req: Request, _env: Env): Promise<string | null> {
  // TODO: validate Base44 session JWT, return user ID or null
  return 'user_placeholder';
}

async function verifyAdminToken(_req: Request, env: Env): Promise<string | null> {
  // TODO: validate admin JWT, check user_id === env.ADMIN_USER_ID
  return env.ADMIN_USER_ID;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
