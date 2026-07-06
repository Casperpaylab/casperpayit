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

## Project Structure

```
.
├── bot.js                          # Telegram bot entry point
├── package.json                    # Dependencies and scripts
├── Procfile                        # Railway deployment configuration
├── README.md                       # This file
├── lib/
│   ├── caspay/
│   │   ├── core.js                # Core wallet & invoice logic
│   │   ├── gateway.js             # Casper blockchain interface
│   │   ├── invoice_listener.js    # Payment listener service
│   │   └── state.js               # Local state management
│   └── x402/
│       └── wrapper.js             # x402 protocol wrapper
├── server/
│   └── index.js                   # Webhook and API server
├── test/
│   ├── caspay.test.js            # Core functionality tests
│   ├── cep18.integration.test.js  # Token integration tests
│   ├── webhook.integration.test.js # Webhook tests
│   └── ...                        # Additional test suites
└── contracts/
    └── fee_distributor/          # Smart contract for fee distribution
```

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
- `INVOICE_FORWARDING_SECRET` — optional secret to encrypt invoice private keys

> In Railway, set the build command to `npm install` and the start command for the bot service to `npm run bot`. Do not put `npm run bot` in the build step.

## Notes

The original x402 demo server remains available in [server/index.js](server/index.js), but the default bot behavior now focuses on the CasPay experience.

## License

MIT
