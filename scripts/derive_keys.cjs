const fs = require('fs');
const path = require('path');
const sdk = require('casper-js-sdk');

const OWNER_KEY_PATH = process.env.OWNER_KEY_PATH || process.env.CSPR_OWNER_KEY_PATH;
const OPERATOR_KEY_PATH = process.env.OPERATOR_KEY_PATH || process.env.CSPR_OPERATOR_KEY_PATH;
const OWNER_KEY_PEM = process.env.OWNER_KEY_PEM || process.env.CSPR_OWNER_KEY_PEM;
const OPERATOR_KEY_PEM = process.env.OPERATOR_KEY_PEM || process.env.CSPR_OPERATOR_KEY_PEM;

function fail(message) {
  console.error('ERROR:', message);
  process.exit(1);
}

function loadPem(value, label) {
  if (!value || value.trim().length === 0) {
    fail(`No PEM value configured for ${label}. Use ${label}_KEY_PATH or ${label}_KEY_PEM.`);
  }

  const candidate = value.trim();
  const absolutePath = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
    return fs.readFileSync(absolutePath, 'utf8');
  }

  if (candidate.includes('BEGIN')) {
    return candidate;
  }

  fail(`Cannot load PEM for ${label}. Provide a valid file path or PEM content.`);
}

function printKeyInfo(label, pem) {
  const key = sdk.PrivateKey.fromPem(pem);
  const pub = key.publicKey();
  console.log(`--- ${label} ---`);
  console.log('Public key hex:', pub.toHex());
  console.log('Account hash:', pub.accountHash().toHex());
}

const ownerPem = OWNER_KEY_PEM || loadPem(OWNER_KEY_PATH, 'OWNER');
const operatorPem = OPERATOR_KEY_PEM || loadPem(OPERATOR_KEY_PATH, 'OPERATOR');

printKeyInfo('Owner key', ownerPem);
printKeyInfo('Operator key', operatorPem);
