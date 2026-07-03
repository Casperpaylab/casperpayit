# Setup Guide

## Quick links

| What | Link |
|---|---|
| CSPR.cloud sign up (access token) | https://console.cspr.build/sign-up |
| Casper Testnet faucet | https://testnet.cspr.live/tools/faucet |
| Casper Wallet (browser extension) | https://casperwallet.io |
| @x402/core docs | https://docs.x402.org |
| @make-software/casper-x402 (GitHub) | https://github.com/make-software/casper-x402 |
| Casper developer community | https://t.me/CSPRDevelopers |

## 1. Install Node.js

You need Node.js 18 or newer. Check with:

```
node -v
```

## 2. Install dependencies

```
npm install
```

This pulls in `@x402/core`, `@x402/express`, `@make-software/casper-x402`, and `casper-js-sdk`.

## 3. Get a CSPR.cloud account and access token

1. Go to [console.cspr.build/sign-up](https://console.cspr.build/sign-up) and sign up
2. Create a project, this gives you an access token
3. Getting a token may involve a short request/approval step rather than being instant, do this early
4. Copy your token into `.env` as `CSPR_CLOUD_ACCESS_TOKEN`

## 4. Create two Casper Testnet accounts

You need two separate accounts: one to receive payments (the server), one to send them (the agent).

1. Install [Casper Wallet](https://www.casperwallet.io/) or use `casper-js-sdk` to generate keypairs
2. Make sure both accounts are set to **Testnet**
3. Fund both with testnet CSPR from the [faucet](https://testnet.cspr.live/tools/faucet) (for transaction fees)
4. Both accounts also need a balance of the specific CEP-18 token your server will accept as payment

## 5. Fill in `.env`

```
cp .env.example .env
```

Fill in:

- `CSPR_CLOUD_ACCESS_TOKEN`, from Step 3
- `PAY_TO_ADDRESS`, the server's receiving account hash (the "00"-prefixed format)
- `TOKEN_CONTRACT_HASH`, the token contract hash you're testing with
- `PRICE_IN_MOTES`, the price per request in motes (1 CSPR = 10^9 motes)
- `AGENT_PRIVATE_KEY`, the paying account's full PEM private key block
- `AGENT_KEY_ALGORITHM`, `ED25519` or `SECP256K1`, matching your actual key type

Note: For the hackathon/demo we support native CSPR payments by default. You can also use a stablecoin transfer on Casper (USDT/USDC) by setting `TOKEN_CONTRACT_HASH`, `TOKEN_NAME`, and `TOKEN_VERSION` in `.env` and providing an operator key if the facilitator builds the transfer. Otherwise, clients can submit a signed stablecoin deploy directly.

You can supply the agent private key in one of three ways (pick one):

- `AGENT_PRIVATE_KEY`: the full PEM block. Some dotenv parsers truncate multiline values, so this may fail.
- `AGENT_PRIVATE_KEY_PATH`: path to a file containing the PEM (recommended).
- `AGENT_PRIVATE_KEY_BASE64`: the PEM encoded as base64 (single-line). The code will decode it.

**Never commit `.env` or paste these values anywhere public.**

## 6. Run it

In one terminal:

```
npm run server
```

You should see `[server] PayIT x402 demo resource server (v2) running on port 4021`. On startup, the server contacts the facilitator to sync supported payment kinds, if this fails, double check `CSPR_CLOUD_ACCESS_TOKEN` is correct and that nothing on your network blocks `x402-facilitator.cspr.cloud`.

In another terminal:

```
npm run bot
```

The bot will request `/market-data`, handle the x402 payment flow, and display the response in Telegram.

## 7. Optional: Telegram bot

1. Create a Telegram bot via [BotFather](https://t.me/BotFather) and copy the bot token.
2. Add `BOT_TOKEN` to your `.env` (see below).
3. Run the bot:

```
npm run bot
```

Send `/marketdata` to the bot to trigger the agent to request `/market-data` and return the response in chat. The bot uses the same agent credentials (so ensure `AGENT_PRIVATE_KEY` and other env vars are set).

## Important: this project must stay ESM

`package.json` has `"type": "module"` set deliberately. `@make-software/casper-x402`'s CommonJS build has a real packaging bug (it crashes on `require()` due to a `casper-js-sdk` interop mismatch). The ESM build does not have this bug. Do not convert this project back to CommonJS, or you will hit that crash.

## Troubleshooting

- **"Failed to initialize: no supported payment kinds loaded"**: the server couldn't reach the facilitator on startup. Check `CSPR_CLOUD_ACCESS_TOKEN` and your network/firewall settings.
- **Signing errors**: confirm `AGENT_PRIVATE_KEY` in `.env` is the full PEM block and `AGENT_KEY_ALGORITHM` matches your actual key type.
- **"Named export not found" errors**: confirm you're running Node 18+, and that `package.json` still has `"type": "module"` set.
