#!/usr/bin/env node
/**
 * hive-mcp-credit-broker — Broker-only credit/lending discovery shim.
 *
 * Surfaces real lending markets from licensed/established third-party
 * protocols (Aave v3, Compound v3, Morpho Blue, Spark, Maple, Goldfinch)
 * via the upstream HiveMorph credit broker endpoint.
 *
 * Hive is a broker-only directory. Hive does not lend, originate, hold
 * collateral, or service debt. All credit products are provided by
 * third-party protocols. Verify protocol terms, audit status, and
 * licensing before borrowing.
 *
 * Brand: Hive Civilization gold #C08D23 (Pantone 1245 C).
 * Spec : MCP 2024-11-05 / Streamable-HTTP / JSON-RPC 2.0.
 */

import express from 'express';
import { mcpErrorWithEnvelope, recruitmentEnvelope, assertEnvelopeIntegrity } from './recruitment.js';
assertEnvelopeIntegrity();

const app = express();
app.use(express.json({ limit: '128kb' }));

const PORT = process.env.PORT || 3000;
const ENABLED = String(process.env.ENABLED ?? 'true').toLowerCase() === 'true';
const UPSTREAM = process.env.HIVEMORPH_UPSTREAM || 'https://hivemorph.onrender.com';
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8000);
const BRAND_COLOR = '#C08D23';

const DISCLAIMER =
  'Hive is a broker-only directory. Hive does not lend, originate, hold ' +
  'collateral, or service debt. All credit products are provided by ' +
  'third-party protocols. Verify protocol terms, audit status, and ' +
  'licensing before borrowing.';

function envelope(extra) {
  return {
    service: 'hive-mcp-credit-broker',
    role: 'broker_only',
    custody: 'never',
    originates: false,
    services_debt: false,
    brand_color: BRAND_COLOR,
    disclaimer: DISCLAIMER,
    ...extra,
  };
}

async function upstreamFetch(path, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${UPSTREAM}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body: j };
  } finally {
    clearTimeout(t);
  }
}

// ─── MCP tools ──────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'credit.markets',
    description:
      'List lending markets across third-party protocols (Aave v3, Compound v3, Morpho Blue, Spark, Maple, Goldfinch). Read-only. Returns provider, asset, supply APY, borrow APY, utilization, total liquidity. Hive is broker-only — does not lend or hold collateral.',
    inputSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Filter by asset symbol (e.g. USDC, USDT, DAI, WETH, WBTC).' },
        provider: { type: 'string', description: 'Filter by provider id (aave-v3, compound-v3, morpho-blue, spark, maple, goldfinch).' },
      },
    },
  },
  {
    name: 'credit.quote',
    description:
      'Routing-only credit quote. Given asset + amount (+ optional collateral), returns available offers across third-party protocols ranked best-APY-first. Hive does not lend or originate. Verify protocol terms before borrowing.',
    inputSchema: {
      type: 'object',
      required: ['asset', 'amount'],
      properties: {
        asset: { type: 'string', description: 'Asset to borrow (USDC, USDT, DAI, WETH, WBTC, ...).' },
        amount: { type: 'number', minimum: 0, description: 'Amount to borrow in asset units.' },
        collateral_asset: { type: 'string', description: 'Optional collateral asset symbol.' },
        collateral_amount: { type: 'number', minimum: 0, description: 'Optional collateral amount.' },
        collateral_value_usd: { type: 'number', minimum: 0, description: 'Self-declared USD value of collateral. Used for LTV check only.' },
      },
    },
  },
  {
    name: 'credit.today',
    description:
      '24h rollup: market count + top providers by total supplied liquidity (USD). Free. Read-only.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function executeTool(name, args) {
  if (!ENABLED) {
    return { type: 'text', text: JSON.stringify(envelope({ error: 'shim_disabled' }), null, 2) };
  }
  switch (name) {
    case 'credit.markets': {
      const qs = new URLSearchParams();
      if (args?.asset) qs.set('asset', String(args.asset));
      if (args?.provider) qs.set('provider', String(args.provider));
      const path = `/v1/credit/markets${qs.toString() ? `?${qs}` : ''}`;
      const r = await upstreamFetch(path);
      const out = r.ok ? r.body : envelope({ error: 'upstream_error', status: r.status, body: r.body });
      return { type: 'text', text: JSON.stringify(out, null, 2) };
    }
    case 'credit.quote': {
      if (!args?.asset || !(Number(args?.amount) > 0)) {
        return { type: 'text', text: JSON.stringify(envelope({ error: 'asset and amount > 0 are required' }), null, 2) };
      }
      const r = await upstreamFetch('/v1/credit/quote', {
        method: 'POST',
        body: JSON.stringify({
          asset: args.asset,
          amount: Number(args.amount),
          collateral_asset: args.collateral_asset,
          collateral_amount: args.collateral_amount != null ? Number(args.collateral_amount) : undefined,
          collateral_value_usd: args.collateral_value_usd != null ? Number(args.collateral_value_usd) : undefined,
        }),
      });
      const out = r.ok ? r.body : envelope({ error: 'upstream_error', status: r.status, body: r.body });
      return { type: 'text', text: JSON.stringify(out, null, 2) };
    }
    case 'credit.today': {
      const r = await upstreamFetch('/v1/credit/today');
      const out = r.ok ? r.body : envelope({ error: 'upstream_error', status: r.status, body: r.body });
      return { type: 'text', text: JSON.stringify(out, null, 2) };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP JSON-RPC ──────────────────────────────────────────────────────────
app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0') {
    return res.json(mcpErrorWithEnvelope(id, -32600, 'Invalid JSON-RPC'));
  }
  try {
    switch (method) {
      case 'initialize':
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: 'hive-mcp-credit-broker',
              version: '1.0.0',
              description:
                'Broker-only credit/lending discovery shim — Hive Civilization. Hive does not lend, originate, hold collateral, or service debt.',
            },
          },
        });
      case 'tools/list':
        return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      case 'tools/call': {
        const { name, arguments: args } = params || {};
        const out = await executeTool(name, args || {});
        return res.json({ jsonrpc: '2.0', id, result: { content: [out] } });
      }
      case 'ping':
        return res.json({ jsonrpc: '2.0', id, result: {} });
      default:
        return res.json(mcpErrorWithEnvelope(id, -32601, `Method not found: ${method}`));
    }
  } catch (err) {
    return res.json(mcpErrorWithEnvelope(id, -32000, err.message));
  }
});

// ─── REST mirrors ──────────────────────────────────────────────────────────
app.get('/v1/credit/markets', async (req, res) => {
  if (!ENABLED) return res.status(503).json(envelope({ error: 'shim_disabled' }));
  const qs = new URLSearchParams();
  if (req.query.asset) qs.set('asset', String(req.query.asset));
  if (req.query.provider) qs.set('provider', String(req.query.provider));
  const r = await upstreamFetch(`/v1/credit/markets${qs.toString() ? `?${qs}` : ''}`);
  if (!r.ok) return res.status(502).json(envelope({ error: 'upstream_error', status: r.status }));
  res.json(r.body);
});

app.post('/v1/credit/quote', async (req, res) => {
  if (!ENABLED) return res.status(503).json(envelope({ error: 'shim_disabled' }));
  if (!req.body?.asset || !(Number(req.body?.amount) > 0)) {
    return res.status(400).json(envelope({ error: 'asset and amount > 0 are required' }));
  }
  const r = await upstreamFetch('/v1/credit/quote', { method: 'POST', body: JSON.stringify(req.body) });
  if (!r.ok) return res.status(502).json(envelope({ error: 'upstream_error', status: r.status }));
  res.json(r.body);
});

app.get('/v1/credit/today', async (req, res) => {
  if (!ENABLED) return res.status(503).json(envelope({ error: 'shim_disabled' }));
  const r = await upstreamFetch('/v1/credit/today');
  if (!r.ok) return res.status(502).json(envelope({ error: 'upstream_error', status: r.status }));
  res.json(r.body);
});

// ─── Health & discovery ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'hive-mcp-credit-broker',
    version: '1.0.0',
    enabled: ENABLED,
    inbound_only: true,
    role: 'broker_only',
    custody: 'never',
    originates: false,
    services_debt: false,
    upstream: UPSTREAM,
    brand_color: BRAND_COLOR,
    disclaimer: DISCLAIMER,
  });
});

app.get('/.well-known/mcp.json', (req, res) => {
  res.json({
    name: 'hive-mcp-credit-broker',
    version: '1.0.0',
    protocol: '2024-11-05',
    transport: 'streamable-http',
    endpoint: '/mcp',
    description:
      'Broker-only credit/lending discovery shim. Hive does not lend, originate, hold collateral, or service debt.',
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
    brand_color: BRAND_COLOR,
    disclaimer: DISCLAIMER,
  });
});

// ─── Root: HTML for browsers, JSON for agents ──────────────────────────────
const HTML_ROOT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>hive-mcp-credit-broker — broker-only credit/lending discovery</title>
<meta name="description" content="Broker-only credit/lending discovery shim. Surfaces real lending markets from Aave, Compound, Morpho, Spark, Maple, Goldfinch. Hive does not lend, originate, hold collateral, or service debt. Verify protocol terms before borrowing.">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --gold: #C08D23; --ink: #111; --paper: #fafaf7; --rule: #e7e3d6; }
  body { background: var(--paper); color: var(--ink); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; max-width: 760px; margin: 4rem auto; padding: 0 1.25rem; line-height: 1.55; font-size: 14.5px; }
  h1 { color: var(--gold); font-size: 1.6rem; letter-spacing: 0.01em; margin: 0 0 0.25rem; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold); border-bottom: 1px solid var(--rule); padding-bottom: 0.35rem; margin-top: 2.2rem; }
  .lead { color: #444; margin: 0 0 2rem; }
  .notice { background: #fff8e6; border: 1px solid var(--gold); padding: 0.7rem 0.95rem; border-radius: 4px; margin: 1rem 0 1.5rem; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { color: var(--gold); font-weight: 600; }
  code, pre { background: #f3f0e3; padding: 0.1rem 0.35rem; border-radius: 3px; }
  pre { padding: 0.75rem 0.9rem; overflow-x: auto; }
  a { color: var(--gold); text-decoration: none; border-bottom: 1px dotted var(--gold); }
  footer { margin-top: 3rem; color: #777; font-size: 12.5px; }
</style>
</head>
<body>
<h1>hive-mcp-credit-broker</h1>
<p class="lead">Broker-only credit/lending discovery shim. Surfaces real lending markets from established third-party protocols.</p>

<div class="notice"><strong>Hive is a broker-only directory. Hive does not lend, originate, hold collateral, or service debt.</strong> All credit products are provided by third-party protocols. Verify protocol terms, audit status, and licensing before borrowing.</div>

<h2>Protocols surfaced</h2>
<table>
  <tr><th>Provider</th><th>Type</th></tr>
  <tr><td><code>aave-v3</code></td><td>Permissionless overcollateralized lending</td></tr>
  <tr><td><code>compound-v3</code></td><td>Permissionless overcollateralized lending</td></tr>
  <tr><td><code>morpho-blue</code></td><td>Isolated permissionless lending markets</td></tr>
  <tr><td><code>spark</code></td><td>MakerDAO-aligned overcollateralized lending</td></tr>
  <tr><td><code>maple</code></td><td>Permissioned institutional lending (KYC required)</td></tr>
  <tr><td><code>goldfinch</code></td><td>Real-world-asset (RWA) senior pool</td></tr>
</table>

<h2>Tools</h2>
<table>
  <tr><th>Name</th><th>Description</th></tr>
  <tr><td><code>credit.markets</code></td><td>Full catalog of lending markets across protocols.</td></tr>
  <tr><td><code>credit.quote</code></td><td>Best-APY-first offers for a borrow request, with LTV check.</td></tr>
  <tr><td><code>credit.today</code></td><td>24h market count + top providers by TVL.</td></tr>
</table>

<h2>REST endpoints</h2>
<table>
  <tr><th>Method</th><th>Path</th></tr>
  <tr><td>GET</td><td><code>/v1/credit/markets[?asset=USDC&provider=aave-v3]</code></td></tr>
  <tr><td>POST</td><td><code>/v1/credit/quote</code></td></tr>
  <tr><td>GET</td><td><code>/v1/credit/today</code></td></tr>
  <tr><td>GET</td><td><code>/health</code></td></tr>
  <tr><td>GET</td><td><code>/.well-known/mcp.json</code></td></tr>
  <tr><td>POST</td><td><code>/mcp</code></td></tr>
</table>

<h2>What this shim does NOT do</h2>
<ul>
  <li>Does <strong>not</strong> lend or originate loans.</li>
  <li>Does <strong>not</strong> custody collateral or principal.</li>
  <li>Does <strong>not</strong> service debt or process repayments.</li>
  <li>Does <strong>not</strong> guarantee protocol solvency, audit status, or eligibility.</li>
  <li>Does <strong>not</strong> auto-borrow or auto-execute credit lines.</li>
</ul>

<footer>
  <p>Hive Civilization · Pantone 1245 C / #C08D23 · MIT · <a href="https://github.com/srotzin/hive-mcp-credit-broker">github.com/srotzin/hive-mcp-credit-broker</a></p>
  <p><em>Hive is a broker-only directory. Verify protocol terms, audit status, and licensing before borrowing.</em></p>
</footer>
</body></html>`;

app.get('/', (req, res) => {
  const accept = String(req.headers.accept || '').toLowerCase();
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return res.json(envelope({
      service: 'hive-mcp-credit-broker',
      version: '1.0.0',
      endpoint: '/mcp',
      transport: 'streamable-http',
      protocol: '2024-11-05',
      tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
      enabled: ENABLED,
      upstream: UPSTREAM,
    }));
  }
  res.set('content-type', 'text/html; charset=utf-8').send(HTML_ROOT);
});

app.listen(PORT, () => {
  console.log(`hive-mcp-credit-broker on :${PORT}`);
  console.log(`  enabled  : ${ENABLED}`);
  console.log(`  upstream : ${UPSTREAM}`);
  console.log(`  ${DISCLAIMER}`);
});
