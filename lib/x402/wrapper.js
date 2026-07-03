// lib/x402/wrapper.js
// Thin wrapper to centralize x402 middleware configuration for CasperPay.

import { x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/express";
import { registerExactCasperScheme } from "@make-software/casper-x402/exact/server";

export function createX402Middleware({ facilitatorClient, routes }) {
  const resourceServer = new x402ResourceServer(facilitatorClient);
  registerExactCasperScheme(resourceServer);
  return paymentMiddleware(routes, resourceServer);
}

// Note: This file is a scaffolding point. The `facilitatorClient` should
// implement the HTTPFacilitatorClient interface (see @x402/core/server).
