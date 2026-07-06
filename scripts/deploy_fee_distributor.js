import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import sdk from 'casper-js-sdk';

dotenv.config();

let NODE_RPC = process.env.CSPR_NODE_RPC || process.env.CASPER_NODE_RPC;
const CSPR_CLOUD_ACCESS_TOKEN = process.env.CSPR_CLOUD_ACCESS_TOKEN;
if (NODE_RPC && !NODE_RPC.endsWith('/rpc')) {
  NODE_RPC = NODE_RPC.replace(/\/+$/, '') + '/rpc';
}
const CHAIN_NAME = process.env.CHAIN_NAME || process.env.CASPER_CHAIN_NAME || 'casper-test';
const DEFAULT_WASM_PATH = path.resolve(process.cwd(), 'contracts', 'fee_distributor', 'target', 'wasm32-unknown-unknown', 'release', 'fee_distributor.wasm');
const WASM_PATH = process.env.FEE_DISTRIBUTOR_WASM_PATH || DEFAULT_WASM_PATH;
const OWNER_ADDRESS = process.env.FEE_DISTRIBUTOR_OWNER_ADDRESS || process.env.FEE_DISTRIBUTOR_FEE_RECEIVER || process.env.PAY_TO_ADDRESS || '';
const FEE_PCT = process.env.FEE_DISTRIBUTOR_FEE_PCT || process.env.FEE_PCT;
const TOKEN_CONTRACT_HASH = process.env.FEE_DISTRIBUTOR_TOKEN_CONTRACT_HASH || process.env.TOKEN_CONTRACT_HASH;
const TOKEN_NAME = process.env.FEE_DISTRIBUTOR_TOKEN_NAME || process.env.TOKEN_NAME;
const TOKEN_VERSION = process.env.FEE_DISTRIBUTOR_TOKEN_VERSION || process.env.TOKEN_VERSION;
const PRIVATE_KEY_PATH = process.env.FEE_DISTRIBUTOR_OPERATOR_PRIVATE_KEY_PATH || process.env.OPERATOR_PRIVATE_KEY_PATH;
const PRIVATE_KEY_PEM = process.env.FEE_DISTRIBUTOR_OPERATOR_PRIVATE_KEY || process.env.OPERATOR_PRIVATE_KEY;
const PRIVATE_KEY_BASE64 = process.env.FEE_DISTRIBUTOR_OPERATOR_PRIVATE_KEY_BASE64 || process.env.OPERATOR_PRIVATE_KEY_BASE64;
const PRIVATE_KEY_ALGORITHM = process.env.FEE_DISTRIBUTOR_OPERATOR_KEY_ALGORITHM || process.env.OPERATOR_KEY_ALGORITHM;
const DEFAULT_PAYMENT_AMOUNT = process.env.FEE_DISTRIBUTOR_PAYMENT_AMOUNT || process.env.FEE_DISTRIBUTOR_PAYMENT_AMOUNT_MOTES || '300000000000';
const SKIP_SIGN = process.argv.includes('--skip-sign') || process.env.SKIP_SIGN === '1' || process.env.SKIP_SIGN === 'true';
const OPERATOR_PUBLIC_KEY = process.env.FEE_DISTRIBUTOR_OPERATOR_PUBLIC_KEY || process.env.OPERATOR_PUBLIC_KEY;

function fail(message) {
  console.error('ERROR:', message);
  process.exit(1);
}

function loadPrivateKeyPem() {
  if (PRIVATE_KEY_PATH && PRIVATE_KEY_PATH.trim().length > 0) {
    const absolutePath = path.isAbsolute(PRIVATE_KEY_PATH)
      ? PRIVATE_KEY_PATH
      : path.resolve(process.cwd(), PRIVATE_KEY_PATH);
    if (!fs.existsSync(absolutePath)) {
      fail(`Operator private key file not found: ${absolutePath}`);
    }
    return fs.readFileSync(absolutePath, 'utf8');
  }

  if (PRIVATE_KEY_PEM && PRIVATE_KEY_PEM.trim().length > 0) {
    return PRIVATE_KEY_PEM;
  }

  if (PRIVATE_KEY_BASE64 && PRIVATE_KEY_BASE64.trim().length > 0) {
    return Buffer.from(PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }

  fail('Operator private key not configured. Set FEE_DISTRIBUTOR_OPERATOR_PRIVATE_KEY_PATH, OPERATOR_PRIVATE_KEY_PATH, FEE_DISTRIBUTOR_OPERATOR_PRIVATE_KEY, OPERATOR_PRIVATE_KEY, FEE_DISTRIBUTOR_OPERATOR_PRIVATE_KEY_BASE64, or OPERATOR_PRIVATE_KEY_BASE64.');
}

function tryParsePrivateKey(pem, algorithm) {
  try {
    sdk.PrivateKey.fromPem(pem, algorithm);
    return true;
  } catch {
    return false;
  }
}

function getKeyAlgorithm(pem) {
  if (PRIVATE_KEY_ALGORITHM && PRIVATE_KEY_ALGORITHM.trim().length > 0) {
    const normalized = PRIVATE_KEY_ALGORITHM.trim().toUpperCase();
    if (sdk.KeyAlgorithm[normalized]) {
      return sdk.KeyAlgorithm[normalized];
    }
    fail(`Unsupported key algorithm: ${PRIVATE_KEY_ALGORITHM}. Use ED25519 or SECP256K1.`);
  }

  const trimmed = pem.trim();
  if (trimmed.startsWith('-----BEGIN ED25519 PRIVATE KEY-----')) {
    return sdk.KeyAlgorithm.ED25519;
  }
  if (trimmed.startsWith('-----BEGIN EC PRIVATE KEY-----')) {
    return sdk.KeyAlgorithm.SECP256K1;
  }

  if (trimmed.startsWith('-----BEGIN PRIVATE KEY-----')) {
    if (tryParsePrivateKey(pem, sdk.KeyAlgorithm.ED25519)) {
      return sdk.KeyAlgorithm.ED25519;
    }
    if (tryParsePrivateKey(pem, sdk.KeyAlgorithm.SECP256K1)) {
      return sdk.KeyAlgorithm.SECP256K1;
    }
    fail('Unable to detect private key algorithm from PKCS#8 PEM. Please set FEE_DISTRIBUTOR_OPERATOR_KEY_ALGORITHM or OPERATOR_KEY_ALGORITHM.');
  }

  if (tryParsePrivateKey(pem, sdk.KeyAlgorithm.ED25519)) {
    return sdk.KeyAlgorithm.ED25519;
  }
  if (tryParsePrivateKey(pem, sdk.KeyAlgorithm.SECP256K1)) {
    return sdk.KeyAlgorithm.SECP256K1;
  }

  fail('Unable to detect private key algorithm. Set FEE_DISTRIBUTOR_OPERATOR_KEY_ALGORITHM or OPERATOR_KEY_ALGORITHM to ED25519 or SECP256K1.');
}

function makeKey(value, forceAccount = false) {
  if (!value || value.trim().length === 0) {
    fail('Key string is required for owner or contract hash.');
  }

  let keyString = value.trim();
  if (forceAccount) {
    if (/^0[23][0-9a-fA-F]{66}$/.test(keyString)) {
      try {
        const publicKey = sdk.PublicKey.fromHex(keyString);
        keyString = `account-hash-${publicKey.accountHash().toHex()}`;
      } catch (e) {
        fail(`Failed to convert public key to account hash: ${e.message || e}`);
      }
    } else if (/^[0-9a-fA-F]{64}$/.test(keyString)) {
      keyString = `account-hash-${keyString}`;
    }
  } else {
    if (/^[0-9a-fA-F]{64}$/.test(keyString)) {
      keyString = `hash-${keyString}`;
    }
  }

  try {
    return sdk.Key.newKey(keyString);
  } catch (e) {
    fail(`Failed to parse key from \"${keyString}\": ${e.message || e}`);
  }
}

function parseUint8(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    fail(`Invalid fee percentage: ${value}. Use an integer between 0 and 255.`);
  }
  return parsed;
}

async function main() {
  if (!NODE_RPC) {
    fail('Casper node RPC not configured. Set CSPR_NODE_RPC or CASPER_NODE_RPC.');
  }
  if (!OWNER_ADDRESS) {
    fail('Fee distributor owner address is not configured. Set FEE_DISTRIBUTOR_OWNER_ADDRESS.');
  }
  if (!FEE_PCT) {
    fail('Fee percentage is not configured. Set FEE_DISTRIBUTOR_FEE_PCT or FEE_PCT.');
  }
  if (!TOKEN_CONTRACT_HASH) {
    fail('Token contract hash is not configured. Set FEE_DISTRIBUTOR_TOKEN_CONTRACT_HASH or TOKEN_CONTRACT_HASH.');
  }
  if (!TOKEN_NAME) {
    fail('Token name is not configured. Set FEE_DISTRIBUTOR_TOKEN_NAME or TOKEN_NAME.');
  }
  if (!TOKEN_VERSION) {
    fail('Token version is not configured. Set FEE_DISTRIBUTOR_TOKEN_VERSION or TOKEN_VERSION.');
  }
  if (!fs.existsSync(WASM_PATH)) {
    fail(`Fee distributor WASM not found at ${WASM_PATH}. Build the contract with cargo before deploying.`);
  }

  const wasmBytes = fs.readFileSync(WASM_PATH);
  let privateKey;
  let publicKey;
  if (SKIP_SIGN) {
    if (!OPERATOR_PUBLIC_KEY || OPERATOR_PUBLIC_KEY.trim().length === 0) {
      fail('Skipping signing requires setting FEE_DISTRIBUTOR_OPERATOR_PUBLIC_KEY (hex public key).');
    }
    try {
      publicKey = sdk.PublicKey.fromHex(OPERATOR_PUBLIC_KEY.trim());
    } catch (e) {
      fail(`Failed to parse operator public key: ${e.message || e}`);
    }
  } else {
    const privateKeyPem = loadPrivateKeyPem();
    const keyAlgorithm = getKeyAlgorithm(privateKeyPem);
    privateKey = sdk.PrivateKey.fromPem(privateKeyPem, keyAlgorithm);
    publicKey = privateKey.publicKey;
  }

  const header = sdk.DeployHeader.default();
  header.chainName = CHAIN_NAME;
  header.account = publicKey;

  const ownerKey = makeKey(OWNER_ADDRESS, true);
  const tokenContractKey = makeKey(TOKEN_CONTRACT_HASH, false);
  const feePct = parseUint8(FEE_PCT);

  const sessionArgs = sdk.Args.fromMap({
    owner_key: sdk.CLValue.newCLKey(ownerKey),
    fee_pct: sdk.CLValue.newCLUint8(feePct),
    token_contract_hash: sdk.CLValue.newCLKey(tokenContractKey),
    token_name: sdk.CLValue.newCLString(TOKEN_NAME),
    token_version: sdk.CLValue.newCLString(TOKEN_VERSION),
  });

  const session = sdk.ExecutableDeployItem.newModuleBytes(wasmBytes, sessionArgs);
  const paymentAmount = Number(DEFAULT_PAYMENT_AMOUNT);
  if (!Number.isInteger(paymentAmount) || paymentAmount <= 0) {
    fail(`Invalid payment amount: ${DEFAULT_PAYMENT_AMOUNT}. Use a positive integer number of motes.`);
  }
  const payment = sdk.ExecutableDeployItem.standardPayment(paymentAmount);
  const deploy = sdk.Deploy.makeDeploy(header, payment, session);

  if (!SKIP_SIGN) {
    deploy.sign(privateKey);
    console.log('Signing deploy...');
    // Optionally write the signed deploy to disk for rebroadcasting
    if (process.env.WRITE_SIGNED === '1' || process.env.WRITE_SIGNED === 'true') {
      try {
        const signedPath = path.resolve(process.cwd(), 'fee_distributor_deploy_signed.json');
        const deployJson = (typeof deploy.toJSON === 'function') ? deploy.toJSON() : deploy;
        fs.writeFileSync(signedPath, JSON.stringify(deployJson, null, 2));
        console.log('Signed deploy written to', signedPath);
      } catch (e) {
        console.warn('Failed to write signed deploy to file:', e.message || e);
      }
    }
    console.log('Submitting fee distributor install deploy...');
    // Optionally rebroadcast the signed deploy to a list of RPC endpoints
    if (process.env.REBROADCAST_RPCS && process.env.REBROADCAST_RPCS.trim().length > 0) {
      const list = process.env.REBROADCAST_RPCS.split(',').map(s => s.trim()).filter(Boolean);
      for (const r of list) {
        try {
          const h = new sdk.HttpHandler(r);
          const rclient = new sdk.RpcClient(h);
          console.log('Rebroadcasting signed deploy to', r);
          await rclient.putDeploy(deploy);
          console.log('Rebroadcast to', r, 'ok');
        } catch (e) {
          console.warn('Rebroadcast to', r, 'failed:', e && (e.message || e));
        }
      }
    }
  } else {
    console.log('Prepared unsigned fee distributor install deploy (skip-sign).');
    try {
      const unsignedPath = path.resolve(process.cwd(), 'fee_distributor_deploy_unsigned.json');
      const deployJson = (typeof deploy.toJSON === 'function') ? deploy.toJSON() : deploy;
      fs.writeFileSync(unsignedPath, JSON.stringify(deployJson, null, 2));
      console.log('Unsigned deploy written to', unsignedPath);
    } catch (e) {
      console.warn('Failed to write unsigned deploy to file:', e.message || e);
    }
  }
  const handler = new sdk.HttpHandler(NODE_RPC);
  if (CSPR_CLOUD_ACCESS_TOKEN && CSPR_CLOUD_ACCESS_TOKEN.trim().length > 0) {
    handler.setCustomHeaders({ authorization: CSPR_CLOUD_ACCESS_TOKEN });
  }
  const rpc = new sdk.RpcClient(handler);

  // Support a dry-run mode that prepares and signs the deploy but does not submit it.
  // Set `DRY_RUN=1` in the environment to enable.
  if (process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true') {
    console.log('DRY RUN enabled — deploy prepared but not submitted.');
    try {
      const deployHash = (deploy && deploy.hash && typeof deploy.hash.toHex === 'function') ? deploy.hash.toHex() : (deploy && deploy.hash && deploy.hash.hashBytes ? Buffer.from(deploy.hash.hashBytes).toString('hex') : JSON.stringify(deploy && deploy.hash));
      console.log('Prepared deploy hash (signed locally):', deployHash);
    } catch (e) {
      console.log('Prepared deploy (no signed hash available).');
    }
  } else {
    await rpc.putDeploy(deploy);
    const deployHash = (deploy && deploy.hash && typeof deploy.hash.toHex === 'function') ? deploy.hash.toHex() : (deploy && deploy.hash && deploy.hash.hashBytes ? Buffer.from(deploy.hash.hashBytes).toString('hex') : JSON.stringify(deploy && deploy.hash));
    console.log('Deploy submitted successfully.');
    console.log('Deploy hash:', deployHash);
  }
  console.log('Fee distributor wasm:', WASM_PATH);
  console.log('Payment amount (motes):', paymentAmount);
  console.log('Fee receiver address:', OWNER_ADDRESS);
  console.log('Token contract hash:', TOKEN_CONTRACT_HASH);
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
