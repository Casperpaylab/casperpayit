
# CasperPay — x402 Micropayments on Casper

CasperPay adapts PayIT's pay-per-use design to the Casper Network using the x402 protocol.

An AI agent that pays per request for an HTTP API, using the [x402 protocol](https://x402.org) on Casper Testnet, built on **Casper's official x402 implementation** rather than hand-rolled signing.

Built for the **Casper Agentic Buildathon 2026**, as a standalone companion to [PayIT](https://github.com/igboze/PayIt) (a separate, Arc/Circle-based project).

---

## What changed from v1

An earlier version of this repo hand-built the EIP-712 signing and facilitator HTTP calls directly. After discovering Casper's **official** x402 package, `@make-software/casper-x402`, built on Coinbase's `@x402/core` engine, this version was rebuilt on top of it instead. The official package handles signing, encoding, and facilitator communication correctly, and is the implementation Casper itself maintains.

**Real packages used:**
- [`@x402/core`](https://www.npmjs.com/package/@x402/core), Coinbase's transport-agnostic x402 protocol engine
- [`@x402/express`](https://www.npmjs.com/package/@x402/express), Express middleware adapter
- [`@make-software/casper-x402`](https://www.npmjs.com/package/@make-software/casper-x402), Casper's official scheme plugin (client, server, and facilitator implementations)
- [`casper-js-sdk`](https://www.npmjs.com/package/casper-js-sdk), Casper's official JS SDK, used internally for signing

## A known upstream packaging issue (and the fix)

`@make-software/casper-x402`'s **CommonJS** build has a real interop bug: it expects `casper-js-sdk` to expose a `.default` wrapper, which it doesn't in CJS mode. This causes a crash when `require()`-ing the package directly.

**The fix used here:** this project is set to `"type": "module"` in `package.json`, and uses real ES module `import` syntax throughout. The package's **ESM** build does not have this bug. If you fork this and switch back to CommonJS, you will hit this exact crash, stay on ESM.

## How the flow works

1. Agent calls `GET /market-data` with no payment
2. Server (via `@x402/express`'s `paymentMiddleware`) replies `402 Payment Required` with a `PAYMENT-REQUIRED` header describing accepted payment options
3. Agent decodes that header, builds a `x402Client` registered with Casper's official `ExactCasperScheme`, and calls `createPaymentPayload()`, which signs the EIP-712 payment authorization correctly using your real Casper key
4. Agent retries with a `PAYMENT-SIGNATURE` header
5. Server's middleware verifies and settles the payment via CSPR.cloud's facilitator automatically
6. Server returns `200 OK` with the data and a `PAYMENT-RESPONSE` header confirming settlement

## Setup

See [SETUP.md](./SETUP.md) for the full walkthrough.

Quick version:

```bash
git clone https://github.com/igboze/payit-x402-casper.git
cd payit-x402-casper
npm install
cp .env.example .env
# fill in .env with your CSPR.cloud token and Casper testnet keys
npm run server      # in one terminal
npm run bot         # in another terminal
```

### Telegram bot

Run the simple Telegram bot directly from `bot.js`. Set `BOT_TOKEN` in your `.env` and run:

```bash
npm run bot
```

Send `/marketdata` to the bot to request the paid resource.

## What's verified working vs. what needs your real credentials

| Piece | Status |
|---|---|
| Client module loads and builds correctly under ESM | Verified, with a disposable test key |
| Server module's import chain | Verified |
| Server's actual startup against the live facilitator | Not verified in this environment, due to a network egress restriction in the sandbox this was built in. Confirmed reachable from a real developer machine in earlier testing. Run `npm run server` yourself to confirm. |
| Full payment flow (sign → verify → settle) | Needs your real CSPR.cloud token, a funded Casper testnet account, and an operator key to submit native CSPR transfers to confirm |

## License

MIT

## Token (CEP-18) payments

This demo supports optional CEP-18 stablecoin payments (USDT/USDC on Casper) by setting `TOKEN_CONTRACT_HASH` in your `.env`. When present the server switches from native CSPR to token-based payments for configured routes. Provide `TOKEN_NAME` and `TOKEN_VERSION` if known to help the x402 EIP-712 domain match the token metadata.

Operator-driven token transfers are supported by the local facilitator stub — the stub will build, sign, and submit a CEP-18 transfer using `casper-js-sdk` when `OPERATOR_PRIVATE_KEY` and `OPERATOR_PUBLIC_KEY` are set and a `tokenContractHash` is supplied in the transfer request.
