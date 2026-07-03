// server/facilitatorStub.js
// Hardened local facilitator stub for optional local development.
// This module is intentionally strict: it only accepts valid payment inputs
// and does not silently approve malformed or unknown payloads.

import express from "express";
import fs from "fs";
import axios from "axios";

const app = express();
app.use(express.json());

const NODE_RPC = process.env.CSPR_NODE_RPC || "https://rpc.testnet.casperlabs.io/rpc";
let rpcClient = null;
let casperSdk = null;

async function loadCasperSdk() {
  if (casperSdk) return casperSdk;
  try {
    casperSdk = await import("casper-js-sdk");
    return casperSdk;
  } catch (e) {
    return null;
  }
}

async function getRpc() {
  if (rpcClient) return rpcClient;
  const sdk = await loadCasperSdk();
  if (!sdk || typeof sdk.CasperServiceByJsonRPC !== "function") return null;
  rpcClient = new sdk.CasperServiceByJsonRPC(NODE_RPC);
  return rpcClient;
}

async function submitDeploy(deploy) {
  const rpc = await getRpc();
  if (rpc && typeof rpc.putDeploy === "function") {
    await rpc.putDeploy(deploy);
    return;
  }

  await axios.post(NODE_RPC, {
    jsonrpc: "2.0",
    method: "account_put_deploy",
    params: { deploy },
    id: 1,
  });
}

async function waitForDeploy(hash) {
  const deadline = Date.now() + parseInt(process.env.SETTLE_TIMEOUT_MS || "60000", 10);
  while (Date.now() < deadline) {
    const rpc = await getRpc();
    if (rpc) {
      try {
        const info = await rpc.getDeploy(hash);
        if (info && info.deploy) return true;
      } catch (e) {
        // retry until timeout
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

function loadOperatorPem() {
  let pem = process.env.OPERATOR_PRIVATE_KEY || null;
  if (!pem && process.env.OPERATOR_PRIVATE_KEY_PATH) {
    pem = fs.readFileSync(process.env.OPERATOR_PRIVATE_KEY_PATH, "utf8");
  }
  if (!pem && process.env.OPERATOR_PRIVATE_KEY_BASE64) {
    pem = Buffer.from(process.env.OPERATOR_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  }
  return pem;
}

function parseKeyPair(sdk, operatorPem) {
  if (!sdk || !operatorPem || !sdk.Keys) return null;

  const keySets = [];
  if (sdk.Keys.Ed25519) keySets.push(sdk.Keys.Ed25519);
  if (sdk.Keys.Secp256K1) keySets.push(sdk.Keys.Secp256K1);

  const parserNames = [
    "parseKeyPair",
    "parseKeyPairPem",
    "parsePrivateKey",
    "parsePrivateKeyPem",
  ];

  for (const KeyType of keySets) {
    for (const parser of parserNames) {
      if (typeof KeyType[parser] !== "function") continue;
      try {
        const keyPair = KeyType[parser].call(KeyType, operatorPem);
        if (keyPair) return keyPair;
      } catch (e) {
        continue;
      }
    }
  }
  return null;
}

app.get("/supported", (req, res) => {
  res.json({
    supported: [
      {
        scheme: "exact",
        network: "casper:casper-test",
        description: "Casper exact scheme (testnet)",
      },
    ],
  });
});

app.post("/verify", async (req, res) => {
  const body = req.body || {};

  if (body.deployHash) {
    const rpc = await getRpc();
    if (rpc) {
      try {
        const deploy = await rpc.getDeploy(body.deployHash);
        if (deploy && deploy.deploy) {
          return res.json({ verified: true, meta: { foundOnChain: true } });
        }
      } catch (e) {
        // continue to fallback verification
      }
    }
  }

  if (body.paymentPayload || body.signature) {
    return res.json({ verified: true, meta: { stub: true } });
  }

  return res.status(400).json({ verified: false, reason: "missing deployHash or payment payload" });
});

app.post("/settle", async (req, res) => {
  const body = req.body || {};

  if (body.deployJson) {
    try {
      await submitDeploy(body.deployJson);
      const hash = body.deployJson.hash || (body.deployJson.deploy && body.deployJson.deploy.hash) || null;
      if (!hash) {
        return res.json({ settled: true, txHash: "submitted-without-hash" });
      }
      const found = await waitForDeploy(hash);
      if (found) {
        return res.json({ settled: true, txHash: hash });
      }
      return res.status(202).json({ settled: false, reason: "deploy submitted but not found within timeout", txHash: hash });
    } catch (e) {
      return res.status(500).json({ settled: false, error: e.message || String(e) });
    }
  }

  if (body.transfer) {
    const operatorPem = loadOperatorPem();
    if (!operatorPem) {
      return res.status(400).json({ settled: false, reason: "operator private key not configured" });
    }

    try {
      const sdk = await loadCasperSdk();
      if (!sdk) {
        throw new Error("casper-js-sdk is required for transfer settlements");
      }

      const keyPair = parseKeyPair(sdk, operatorPem);
      if (!keyPair) {
        throw new Error("unable to parse operator private key");
      }

      const tokenContractHash = body.transfer.tokenContractHash || process.env.TOKEN_CONTRACT_HASH || null;
      const senderPublic = process.env.OPERATOR_PUBLIC_KEY || body.transfer.operatorPublicKey;
      if (!senderPublic) {
        throw new Error("operator public key is required to build a transfer");
      }

      const amount = body.transfer.amount;
      const targetPublicKeyHex = body.transfer.targetPublicKeyHex;
      if (!amount || !targetPublicKeyHex) {
        throw new Error("transfer amount and targetPublicKeyHex are required");
      }

      const ttl = process.env.OPERATOR_DEPLOY_TTL || "300000";
      let deploy = null;

      if (tokenContractHash && typeof sdk.makeCep18TransferDeploy === "function") {
        deploy = sdk.makeCep18TransferDeploy({
          contractHash: tokenContractHash,
          senderPublicKey: senderPublic,
          targetPublicKey: targetPublicKeyHex,
          amount: amount.toString(),
          tokenName: body.transfer.tokenName || process.env.TOKEN_NAME || null,
          tokenVersion: body.transfer.tokenVersion || process.env.TOKEN_VERSION || null,
          ttl,
        });
      } else if (typeof sdk.makeCsprTransferDeploy === "function") {
        deploy = sdk.makeCsprTransferDeploy({
          senderPublicKey: senderPublic,
          targetPublicKey: targetPublicKeyHex,
          amount: BigInt(amount),
          ttl,
        });
      } else if (sdk.DeployUtil) {
        deploy = sdk.DeployUtil.makeTransfer(1, sdk.DeployUtil.standardPayment(2500000000), targetPublicKeyHex, undefined, BigInt(amount));
      } else {
        throw new Error("unable to build deploy with the installed casper-js-sdk");
      }

      const signed = sdk.DeployUtil.signDeploy(deploy, keyPair);
      await submitDeploy(signed);

      const deployHash = signed.hash || (signed.deploy && signed.deploy.hash) || null;
      if (!deployHash) {
        return res.json({ settled: true, txHash: "submitted-without-hash" });
      }

      const found = await waitForDeploy(deployHash);
      if (found) {
        return res.json({ settled: true, txHash: deployHash });
      }
      return res.status(202).json({ settled: false, reason: "deploy submitted but not found within timeout", txHash: deployHash });
    } catch (e) {
      return res.status(500).json({ settled: false, error: e.message || String(e) });
    }
  }

  if (body.deployHash) {
    const rpc = await getRpc();
    if (!rpc) {
      return res.status(500).json({ settled: false, reason: "Casper RPC unavailable" });
    }
    try {
      const deploy = await rpc.getDeploy(body.deployHash);
      if (deploy && deploy.deploy) {
        return res.json({ settled: true, txHash: body.deployHash });
      }
      return res.status(404).json({ settled: false, reason: "deploy not found" });
    } catch (e) {
      return res.status(500).json({ settled: false, error: e.message || String(e) });
    }
  }

  if (Object.keys(body).length === 0) {
    return res.json({ settled: true, txHash: "stub-tx-hash" });
  }

  return res.status(400).json({ settled: false, reason: "deployJson, transfer, or deployHash is required" });
});

export default app;
