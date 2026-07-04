# Setup Guide

## 1. Install Node.js

Use Node.js 18 or newer.

```bash
node -v
```

## 2. Install dependencies

```bash
npm install
```

## 3. Create a Telegram bot

1. Open Telegram and talk to BotFather.
2. Create a bot and copy the bot token.
3. Put the token in your environment as `BOT_TOKEN`.

## 4. Run the CasPay bot

```bash
node bot.js
```

Then send these commands to the bot in Telegram:

- `/start`
- `/newwallet`
- `/balance`
- `/invoice 25 "Design work"`
- `/pay <invoiceId> <amount>`
- `/invoiceinfo <invoiceId>`

## 5. Optional: keep the x402 demo server

The original demo server in [server/index.js](server/index.js) still works if you want to keep the micropayment flow. For that you will need the standard x402 environment variables such as `CSPR_CLOUD_ACCESS_TOKEN`, `PAY_TO_ADDRESS`, and `BOT_TOKEN`.

## 6. Run tests

```bash
npm test
```
