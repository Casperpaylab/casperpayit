# CasPay — Telegram-Native Non-Custodial Casper Wallet & Invoicing Platform

CasPay is a Telegram-native application that empowers small businesses and independent professionals to create invoices, receive payments, and manage their CSPR wallet directly within Telegram. Built on the Casper blockchain, CasPay provides instant, low-fee micropayments without requiring users to leave their chat interface.

## Overview

This MVP demonstrates a complete non-custodial wallet and invoicing experience accessible entirely through Telegram commands. Users can:

- **Create self-custodial wallets** — Generate CSPR wallets with encrypted key management
- **Issue invoices** — Generate unique payment addresses for each invoice with automatic reconciliation
- **Track payments** — Monitor partial and full payment status in real-time
- **Send payments** — Execute transfers directly from Telegram with a simple command syntax
- **Check balances** — View wallet balance and transaction history without leaving Telegram

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

### Installation

```bash
git clone <repository-url>
cd payit-x402-casper-v2
npm install
```

### Configuration

Create a `.env` file in the project root:

```bash
BOT_TOKEN=your_telegram_bot_token_here
CASPER_NODE_RPC=https://rpc.testnet.casperlabs.io
CASPAY_STATE_FILE=.caspay-state.json
INVOICE_FORWARDING_SECRET=your_secret_key_here
```

### Running Locally

**Start the Telegram bot:**

```bash
npm run bot
```

**Run tests:**

```bash
npm test
```

**Start the webhook server:**

```bash
npm run server
```

## Features

### Telegram Commands

Once the bot is running, users can interact with these commands in Telegram:

| Command | Purpose | Example |
|---------|---------|---------|
| `/start` | Initialize the bot and view help | `/start` |
| `/newwallet` | Create a new CSPR wallet | `/newwallet` |
| `/balance` | Check current wallet balance | `/balance` |
| `/invoice` | Create a new invoice | `/invoice 100 "Consulting services"` |
| `/pay` | Send payment to an invoice | `/pay INV-abc123def 50` |
| `/invoiceinfo` | View invoice details and status | `/invoiceinfo INV-abc123def` |

### Architecture

- **[bot.js](bot.js)** — Telegram bot interface and command handling
- **[server/index.js](server/index.js)** — Webhook server for payment settlement notifications
- **[lib/caspay/core.js](lib/caspay/core.js)** — Wallet creation, invoice generation, and payment reconciliation logic
- **[lib/caspay/state.js](lib/caspay/state.js)** — Local state persistence for wallets and invoices
- **[lib/caspay/gateway.js](lib/caspay/gateway.js)** — Casper blockchain interaction layer
- **[test/](test/)** — Comprehensive test suite for core functionality

## Payment Settlement

### Webhook Integration

The bot exposes `POST /webhook/invoice-settle` for external payment indexers to notify the system of on-chain payments.

**Request format:**

```json
{
  "invoiceId": "INV-abc123",
  "amount": "1000000000",
  "source": "payment_address",
  "txHash": "optional_transaction_hash"
}
```

### On-Chain Detection (Optional)

Enable automatic payment detection by configuring:

```env
CASPER_NODE_RPC=https://rpc.testnet.casperlabs.io
CASPER_USE_TRANSFER_SCAN=true
CASPER_SCAN_LOOKBACK=100
```

## Deployment

### Railway Deployment

This project includes a `Procfile` configured for Railway with two services:

**Web service** (handles webhooks):
```
npm run server
```

**Worker service** (runs the Telegram bot):
```
npm run bot
```

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot API token | `123456:ABCdef...` |
| `CASPAY_STATE_FILE` | Path to persistent state file | `/data/.caspay-state.json` |
| `CASPER_NODE_RPC` | Casper node RPC endpoint | `https://rpc.testnet.casperlabs.io` |
| `INVOICE_FORWARDING_SECRET` | Encryption key for invoice private keys | `your-secret-key` |
| `FEE_DISTRIBUTOR_OPERATOR_KEY_ALGORITHM` | Operator key type for contract signing | `ED25519` |
| `CASPER_USE_TRANSFER_SCAN` | Enable block scanning for payments | `true` |
| `CASPER_SCAN_LOOKBACK` | Number of blocks to scan | `100` |

## Security Considerations

- **Private Keys**: Per-invoice private keys are encrypted with `INVOICE_FORWARDING_SECRET` and never stored in plaintext
- **State Management**: Default file-backed JSON state (use external database for production deployments)
- **Environment Variables**: Keep all secrets in `.env` (excluded from git)
- **Webhook Authentication**: Implement signature verification for production webhooks

## Testing

Run the test suite to verify core functionality:

```bash
npm test
```

Tests cover:
- Wallet creation and key derivation
- Invoice generation and reconciliation
- Partial payment handling
- State persistence

## Repository structure

This section lists the most important root files and directories, with a short description of their role in the CasPay product.

- `bot.js` — Telegram bot entry point for wallet creation, invoice commands, payment status, and user interactions.
- `server/index.js` — API and webhook server that accepts payment settlement events and exposes integration endpoints.
- `lib/caspay/core.js` — core wallet, invoice, and reconciliation logic.
- `lib/caspay/gateway.js` — Casper blockchain helper functions and transfer wrapper.
- `lib/caspay/invoice_listener.js` — invoice payment listener for on-chain/webhook updates.
- `lib/caspay/state.js` — file-backed application state persistence for wallets and invoices.
- `lib/x402/wrapper.js` — adapter layer for x402/Casper protocol utilities.
- `test/` — end-to-end and unit tests covering wallet flow, invoice handling, webhook integration, and Casper interactions.
- `contracts/fee_distributor/` — smart contract source, build scripts, and wasm artifacts for fee distribution.
- `.github/workflows/` — CI workflow definitions used for automated validation and checks.
- `.gitignore` — repository ignore rules for local state, environment files, and build artifacts.
- `Procfile` — process definitions for deployments on Railway/Heroku-style platforms.
- `README.md` — this project overview and usage guide.
- `SETUP.md` — setup instructions and environment configuration notes.
- `package.json` / `package-lock.json` — package metadata, scripts, and dependency lockfile.
- `scripts/` — utility scripts for contract deployment and key derivation.
- `deploy_result.json` — optional deployment artifact output (should be excluded from production source control if it contains environment-specific details).
- `secrets/` — local secrets directory, excluded from git by `.gitignore`.

## Roadmap

This MVP is the foundation for the full CasPay platform:

- ✅ Non-custodial wallet creation in Telegram
- ✅ Invoice issuance with unique payment addresses
- ✅ Payment reconciliation (partial and full)
- 🔄 Multi-currency support
- 🔄 AI-powered payment assistant
- 🔄 Advanced analytics and reporting
- 🔄 Casper 2.0 transfers integration
- 🔄 Mobile app expansion

## Support & Feedback

For issues, feature requests, or questions:

1. Open an issue on GitHub
2. Review existing documentation in the `/docs` folder (if available)
3. Check test files for usage examples

## License

MIT

---

**Built on Casper Blockchain | Powered by Telegram**

> In Railway, set the build command to `npm install` and the start command for the bot service to `npm run bot`. Do not put `npm run bot` in the build step.
