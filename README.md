CasPay — README
==========================

Quick start (local)

1. Copy `.env.example` to `.env` and fill in values (set `BOT_TOKEN` locally to run the bot).

2. Install deps:

```bash
npm install
```

3. Run tests:

```bash
npm test
```

4. Run the bot (requires `BOT_TOKEN`):

```bash
node bot.js
```

Enabling on-chain settlement

- To let the bot automatically detect payments to per-invoice addresses, set `CASPER_NODE_RPC` to your Casper node RPC URL in `.env`.
- Optionally enable block-scanning (best-effort) with `CASPER_USE_TRANSFER_SCAN=true` and tune `CASPER_SCAN_LOOKBACK`.

Webhook approach

The project exposes `POST /webhook/invoice-settle` on the resource server (see `server/index.js`). An external indexer can call this endpoint with `{ invoiceId, amount, source }` to notify the app of received payments.

Notes

- Per-invoice private keys are encrypted with `INVOICE_FORWARDING_SECRET` when created. Keep this secret safe.
- The project uses file-backed JSON state by default (`.caspay-state.json`). For tests we use an isolated file.

Contact

For questions, open an issue or DM the project channel.
# CasPay — Telegram-native Casper wallet and invoicing MVP

CasPay is a Telegram-first product concept for a non-custodial CSPR wallet, AI payments agent, and SME invoicing experience. This workspace now contains a working MVP foundation that demonstrates the core product shape inside Telegram:

- wallet creation and balance lookup
- invoice creation with a unique virtual account address
- invoice payment reconciliation for partial and full payments
- simple in-chat commands for a merchant or payer

The implementation is intentionally lightweight so it can be extended toward the full product vision later.

## What is included

- [bot.js](bot.js) — Telegram bot with `/newwallet`, `/balance`, `/invoice`, `/pay`, and `/invoiceinfo`
- [lib/caspay/core.js](lib/caspay/core.js) — wallet and invoice domain logic
- [lib/caspay/state.js](lib/caspay/state.js) — local persistence for wallets and invoices
- [test/caspay.test.js](test/caspay.test.js) — regression tests for wallet creation and invoice reconciliation

## Quick start

```bash
npm install
npm test
node bot.js
```

Set `BOT_TOKEN` in your environment and start the bot. Then send these commands in Telegram:

- `/start`
- `/newwallet`
- `/balance`
- `/invoice 25 "Design work"`
- `/pay INV-... 25`
- `/invoiceinfo INV-...`

## Product direction

This MVP is the first step toward the full CasPay product brief:

- self-custodial wallet flow
- invoice issuance with virtual account addresses
- automated payment status updates
- a path toward Casper 2.0 transfers and AI-driven command execution

## Notes

The original x402 demo server remains available in [server/index.js](server/index.js), but the default bot behavior now focuses on the CasPay experience.

## License

MIT
