// server/index.js
//
// CasPay resource server for webhook invoice settlement, payment notification,
// and x402 facilitator integration.

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { Telegram } from 'telegraf';
import { HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactCasperScheme } from "@make-software/casper-x402/exact/server";
import { createX402Middleware } from "../lib/x402/wrapper.js";
import facilitatorStub from "./facilitatorStub.js";
import { getInvoice, saveInvoice } from '../lib/caspay/state.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4021;
const FACILITATOR_USE_STUB = process.env.FACILITATOR_USE_STUB === "true";
let FACILITATOR_URL = process.env.FACILITATOR_BASE_URL || "https://x402-facilitator.cspr.cloud";
const CSPR_CLOUD_ACCESS_TOKEN = process.env.CSPR_CLOUD_ACCESS_TOKEN;
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS; // your Casper testnet account hash, "00..." prefixed
const TOKEN_CONTRACT_HASH = process.env.TOKEN_CONTRACT_HASH;
const TOKEN_NAME = process.env.TOKEN_NAME || "USDC";
const TOKEN_VERSION = process.env.TOKEN_VERSION || "1";
const PRICE_IN_MOTES = process.env.PRICE_IN_MOTES || "1000000000"; // default: 1 CSPR = 10^9 motes

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  if (!PAY_TO_ADDRESS) {
    console.error("[server] PAY_TO_ADDRESS is required and missing in .env. The resource server cannot operate without a payment recipient.");
    process.exit(1);
  }

  if (!FACILITATOR_USE_STUB && !CSPR_CLOUD_ACCESS_TOKEN) {
    console.error("[server] CSPR_CLOUD_ACCESS_TOKEN is required unless FACILITATOR_USE_STUB=true.");
    process.exit(1);
  }
} else {
  if (!PAY_TO_ADDRESS) {
    console.warn("[server] PAY_TO_ADDRESS is not set. Tests or imports will run without a payment recipient.");
  }
  if (!FACILITATOR_USE_STUB && !CSPR_CLOUD_ACCESS_TOKEN) {
    console.warn("[server] CSPR_CLOUD_ACCESS_TOKEN is not set. Set FACILITATOR_USE_STUB=true for tests.");
  }
}

if (FACILITATOR_USE_STUB) {
  console.log("[server] Using local facilitator stub for development.");
}

// Optionally start the local facilitator stub for development and point the
// FACILITATOR_URL at it.
if (FACILITATOR_USE_STUB) {
  const stubPort = parseInt(process.env.FACILITATOR_STUB_PORT || "4001", 10);
  facilitatorStub.listen(stubPort, () => console.log(`[facilitator] Stub listening on ${stubPort}`));
  FACILITATOR_URL = `http://localhost:${stubPort}`;
}

// The facilitator client talks to a hosted x402 facilitator (or the stub).
// createAuthHeaders supplies the access token per-endpoint, as the facilitator
// expects.
const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => ({
    verify: { authorization: CSPR_CLOUD_ACCESS_TOKEN },
    settle: { authorization: CSPR_CLOUD_ACCESS_TOKEN },
    supported: { authorization: CSPR_CLOUD_ACCESS_TOKEN },
  }),
});

// Build the core resource server and register Casper's official exact-scheme
// implementation for both testnet and mainnet network identifiers.
// Guard the construction so importing this module in tests (where some
// dependencies or globals may not be present) does not throw.
let resourceServer = null;
try {
  if (typeof x402ResourceServer !== 'undefined') {
    resourceServer = new x402ResourceServer(facilitatorClient);
    registerExactCasperScheme(resourceServer);
  } else {
    // Attempt to require from @x402/core if available
    try {
      const core = await import('@x402/core');
      const X = core?.x402ResourceServer || core?.ResourceServer || null;
      if (X) {
        resourceServer = new X(facilitatorClient);
        registerExactCasperScheme(resourceServer);
      }
    } catch (e) {
      console.warn('[server] x402 resource server unavailable in this environment; continuing with middleware disabled for tests.');
    }
  }
} catch (err) {
  console.warn('[server] Failed to construct x402 resource server (tests mode):', err?.message || err);
}

// Route configuration: what we charge for /market-data.
// extra.name and extra.version are required by Casper's official scheme:
// they build the EIP-712 domain separator for the token, and must match
// the token's actual on-chain name. version defaults to "1" unless the
// token contract specifies otherwise.
// Route configuration: what we charge for /market-data.
// Defaults to native CSPR (motes). If TOKEN_CONTRACT_HASH is set, the demo
// switches to stablecoin payment via the specified Casper token contract.
const routes = {
  "/market-data": {
    accepts: {
      scheme: "exact",
      network: "casper:casper-test",
      payTo: PAY_TO_ADDRESS,
      price: TOKEN_CONTRACT_HASH
        ? {
            asset: TOKEN_CONTRACT_HASH,
            amount: PRICE_IN_MOTES,
            extra: {
              name: TOKEN_NAME,
              version: TOKEN_VERSION,
            },
          }
        : {
            asset: "CSPR",
            amount: PRICE_IN_MOTES,
            extra: {
              native: true,
            },
          },
      maxTimeoutSeconds: 300,
    },
    resource: "/market-data",
    description: TOKEN_CONTRACT_HASH
      ? "Sample market data endpoint, paid per-request in stablecoin on Casper Testnet"
      : "Sample market data endpoint, paid per-request in native CSPR via x402 on Casper Testnet",
  },
};

// Use the centralized wrapper to create the middleware
app.use(createX402Middleware({ facilitatorClient, routes }));

/**
 * The data we actually sell. In a real product this would be a live data
 * feed; here it's a static example so the demo is self-contained.
 */
app.get("/market-data", (req, res) => {
  res.json({
    pair: "CSPR/USD",
    price: 0.0234,
    volume_24h: 12847291,
    fetched_at: new Date().toISOString(),
    note: "Sample data for the PayIT x402-on-Casper demo. Not live market data.",
  });
});


app.get("/", (req, res) => {
  res.json({
    service: "PayIT x402 Demo (Casper Testnet), v2 on official packages",
    endpoint: "GET /market-data",
    note: "Requires payment via the x402 protocol. See README.md.",
    supportedAsset: TOKEN_CONTRACT_HASH ? 'cep18' : 'native',
    tokenContractHash: TOKEN_CONTRACT_HASH || null,
  });
});

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  app.listen(PORT, () => {
    console.log(`[server] CasperPay x402 resource server running on port ${PORT}`);
      console.log(`[server] Try: curl ${process.env.SERVER_URL || `http://localhost:${PORT}`}/market-data`);
  });
}

export default app;

// Simple webhook for external indexers to notify of invoice settlements
const TELEGRAM_TOKEN = process.env.BOT_TOKEN || null;
const telegram = TELEGRAM_TOKEN ? new Telegram(TELEGRAM_TOKEN) : null;

app.post('/webhook/invoice-settle', express.json(), async (req, res) => {
  try {
    const { invoiceId, amount, source } = req.body || {};
    if (!invoiceId || !amount) return res.status(400).json({ error: 'invoiceId and amount required' });
    const invoice = getInvoice(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'invoice not found' });
    const applied = Math.min(Number(amount), Number(invoice.remaining || invoice.amount || 0));
    invoice.paid = (invoice.paid || 0) + applied;
    invoice.remaining = Math.max(0, (invoice.remaining || invoice.amount || 0) - applied);
    invoice.payments = [ ...(invoice.payments || []), { amount: applied, receivedAt: new Date().toISOString(), source: source || 'webhook' } ];
    if (invoice.remaining <= 0) invoice.status = 'paid';
    else if (invoice.paid > 0) invoice.status = 'partial';
    saveInvoice(invoice);
    if (telegram) {
      try { await telegram.sendMessage(Number(invoice.owner), `🔔 Invoice ${invoice.id} received ${applied} CSPR via ${source || 'webhook'}. Remaining: ${invoice.remaining}`); } catch (e) {}
    }
    return res.json({ ok: true, invoice });
  } catch (err) {
    console.error('[server] /webhook/invoice-settle error', err?.message || err);
    return res.status(500).json({ error: 'internal error' });
  }
});