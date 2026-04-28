# Release Notes

## v1.0.0 — 2026-04-28

Initial release of `hive-mcp-credit-broker`: a broker-only credit/lending
discovery shim for AI agents.

### What's in v1.0.0

- **Three MCP tools** (`credit.markets`, `credit.quote`, `credit.today`)
  exposed over MCP 2024-11-05 / Streamable-HTTP / JSON-RPC 2.0.
- **REST mirrors** at `/v1/credit/markets`, `/v1/credit/quote`, `/v1/credit/today`.
- **Real data** from six third-party protocols, surfaced via the upstream
  HiveMorph credit broker:
  - Aave v3
  - Compound v3
  - Morpho Blue
  - Spark
  - Maple
  - Goldfinch
- **Discovery surfaces**: `/.well-known/mcp.json`, `/health`, root HTML.
- **Brand-aligned**: Hive Civilization gold `#C08D23` (Pantone 1245 C).
- **JSON envelope** with broker-only disclaimer baked into every response.

### Hard rules

- Hive does **not** lend, originate, hold collateral, or service debt.
- The shim does **not** auto-borrow or auto-execute credit lines.
- All credit products are provided by third-party protocols. Verify
  protocol terms, audit status, and licensing before borrowing.

### License

MIT.
