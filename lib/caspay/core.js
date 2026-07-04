import crypto from 'crypto';
import casperJsSdk from 'casper-js-sdk';

const { PrivateKey, KeyAlgorithm, PublicKey } = casperJsSdk.default || casperJsSdk;

function shortHash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 12);
}

function normalizeAccountHash(accountHash) {
  const json = typeof accountHash.toJSON === 'function' ? accountHash.toJSON() : String(accountHash);
  const safeHex = String(json).replace(/^account-hash-?/, '');
  return `account-hash-${safeHex}`;
}

export function deriveCasperAddress(publicKey) {
  const accountHash = publicKey.accountHash();
  return normalizeAccountHash(accountHash);
}

export function createWallet(owner) {
  const ownerKey = owner || 'anonymous';
  const privateKey = PrivateKey.generate(KeyAlgorithm.ED25519);
  const publicKey = PublicKey.fromHex(privateKey.pub.toHex());
  const address = deriveCasperAddress(publicKey);

  return {
    owner: ownerKey,
    address,
    publicKey: publicKey.toHex(),
    privateKeyPem: privateKey.toPem(),
    balance: 0,
    createdAt: new Date().toISOString(),
  };
}

export function createInvoice(wallet, { amount, description, dueDate } = {}) {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Invoice amount must be a positive number.');
  }

  const invoiceId = `INV-${shortHash(`${wallet.owner}:${Date.now()}:${description || 'invoice'}`)}`;
  return {
    id: invoiceId,
    owner: wallet.owner,
    amount: normalizedAmount,
    description: description || 'CasPay invoice',
    dueDate: dueDate || null,
    status: 'open',
    paid: 0,
    remaining: normalizedAmount,
    virtualAccount: `account-hash-${shortHash(`${wallet.owner}:${invoiceId}:invoice`)}`,
    payments: [],
  };
}

export function applyPaymentToInvoice(invoice, amount) {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Payment amount must be a positive number.');
  }

  const incoming = Math.min(invoice.remaining, normalizedAmount);
  const updated = {
    ...invoice,
    paid: invoice.paid + incoming,
    remaining: invoice.remaining - incoming,
    payments: [
      ...(invoice.payments || []),
      {
        amount: incoming,
        receivedAt: new Date().toISOString(),
      },
    ],
  };

  if (updated.remaining <= 0) {
    updated.status = 'paid';
  } else if (updated.paid > 0) {
    updated.status = 'partial';
  } else {
    updated.status = 'open';
  }

  return updated;
}

export function formatInvoice(invoice) {
  return [
    `Invoice ${invoice.id}`,
    `Amount: ${invoice.amount} CSPR`,
    `Paid: ${invoice.paid} CSPR`,
    `Remaining: ${invoice.remaining} CSPR`,
    `Status: ${invoice.status}`,
    `Virtual account: ${invoice.virtualAccount}`,
    invoice.paymentAddress ? `Payment address: ${invoice.paymentAddress}` : null,
    `Description: ${invoice.description}`,
  ].join('\n');
}

function aesEncrypt(secret, plaintext) {
  if (!secret) return plaintext;
  const key = crypto.createHash('sha256').update(String(secret)).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function createHDInvoice(ownerWallet, { amount, description, dueDate } = {}) {
  const invoice = createInvoice(ownerWallet, { amount, description, dueDate });
  // create a unique payment address (random wallet) for this invoice
  const hd = createWallet(`${ownerWallet.owner}:${invoice.id}`);
  invoice.paymentAddress = hd.address;
  // Store the child private key encrypted if secret is provided
  const secret = process.env.INVOICE_FORWARDING_SECRET || null;
  invoice.invoicePrivateKeyEncrypted = aesEncrypt(secret, hd.privateKeyPem);
  // expected amount in micro (for QR generation) — not required but helpful
  invoice.expectedAmountMicro = BigInt(Math.round(Number(amount) * 1e9)).toString();
  return invoice;
}
