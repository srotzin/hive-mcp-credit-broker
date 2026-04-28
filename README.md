# hive-mcp-credit-broker

**Broker-only** credit/lending discovery shim for AI agents. Surfaces real
lending markets from licensed/established third-party protocols and
routes applications.

> Hive is a broker-only directory. Hive does not lend, originate, hold
> collateral, or service debt. All credit products are provided by
> third-party protocols. Verify protocol terms, audit status, and
> licensing before borrowing.

- **Spec**: MCP 2024-11-05 / Streamable-HTTP / JSON-RPC 2.0
- **Brand**: Hive Civilization gold `#C08D23`
- **License**: MIT

## Protocols surfaced

Read-only, real data, refreshed continuously:

| Provider      | Type                                                |
| ------------- | --------------------------------------------------- |
| `aave-v3`     | Permissionless overcollateralized lending           |
| `compound-v3` | Permissionless overcollateralized lending           |
| `morpho-blue` | Isolated permissionless lending markets             |
| `spark`       | MakerDAO-aligned overcollateralized lending         |
| `maple`       | Permissioned institutional lending (KYC required)   |
| `goldfinch`   | Real-world-asset (RWA) senior pool                  |

## Tools

| Name             | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `credit.markets` | Full catalog of lending markets across protocols.                        |
| `credit.quote`   | Best-APY-first offers for a borrow request, with LTV check.              |
| `credit.today`   | 24h market count + top providers by total supplied liquidity (USD).      |

## REST endpoints (mirror MCP tools)

| Method | Path                                                | Purpose                            |
| ------ | --------------------------------------------------- | ---------------------------------- |
| GET    | `/v1/credit/markets[?asset=USDC&provider=aave-v3]`  | List markets                       |
| POST   | `/v1/credit/quote`                                  | Best-APY-first borrow offers       |
| GET    | `/v1/credit/today`                                  | 24h rollup                         |
| GET    | `/health`                                           | Health + disclaimer + brand_color  |
| GET    | `/.well-known/mcp.json`                             | MCP discovery document             |
| POST   | `/mcp`                                              | MCP JSON-RPC endpoint              |

## Quick test

```bash
# Markets for USDC
curl https://hive-mcp-credit-broker.onrender.com/v1/credit/markets?asset=USDC

# Best borrow offers for $50k USDC against $75k WETH collateral
curl -X POST https://hive-mcp-credit-broker.onrender.com/v1/credit/quote \
  -H 'content-type: application/json' \
  -d '{"asset":"USDC","amount":50000,"collateral_asset":"WETH","collateral_value_usd":75000}'

# 24h top providers by TVL
curl https://hive-mcp-credit-broker.onrender.com/v1/credit/today
```

## What this shim does NOT do

- Does **not** lend or originate loans.
- Does **not** custody collateral or principal.
- Does **not** service debt or process repayments.
- Does **not** auto-borrow or auto-execute credit lines.
- Does **not** guarantee protocol solvency, audit status, or eligibility.

## Run locally

```bash
npm install
HIVEMORPH_UPSTREAM=https://hivemorph.onrender.com npm start
```

## Environment variables

| Variable               | Default                          | Notes                                  |
| ---------------------- | -------------------------------- | -------------------------------------- |
| `PORT`                 | `3000`                           | Listen port                            |
| `ENABLED`              | `true`                           | Set to `false` to dormant the shim     |
| `HIVEMORPH_UPSTREAM`   | `https://hivemorph.onrender.com` | HiveMorph credit broker base URL       |
| `UPSTREAM_TIMEOUT_MS`  | `8000`                           | Per-request upstream timeout           |

---

Hive Civilization · Pantone 1245 C / `#C08D23` · MIT
