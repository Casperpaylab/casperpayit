import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';

// Set a dedicated state file for tests so we don't clobber dev state.
const STATE_FILE = path.resolve(process.cwd(), '.caspay-state.test.json');
process.env.CASPAY_STATE_FILE = STATE_FILE;
process.env.CASPER_NODE_RPC = 'http://mock-node.test';

// Mock casper-js-sdk before importing the listener (ESM mock)
await jest.unstable_mockModule('casper-js-sdk', () => ({
  // Provide both a minimal default export (used by core.js) and a
  // named `CasperServiceByJsonRPC` (used by the listener). The defaults
  // are simplified and only sufficient for tests.
  default: {
    PrivateKey: {
      generate: () => ({
        pub: { toHex: () => '0123' },
        toPem: () => '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----',
      }),
    },
    KeyAlgorithm: { ED25519: 'ED25519' },
    PublicKey: {
      fromHex: (hex) => ({
        accountHash: () => `account-hash-${hex.slice(0, 8)}`,
        toHex: () => hex,
      }),
    },
  },
  CasperServiceByJsonRPC: class {
    constructor(url) { this.url = url; }
    async getAccountBalance(accountHash) {
      // return 1 CSPR in motes
      return '1000000000';
    }
  }
}));

const { checkAndSettleInvoice } = await import('../lib/caspay/invoice_listener.js');
const { saveInvoice, getInvoice } = await import('../lib/caspay/state.js');

beforeEach(() => {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
});

afterAll(() => {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
});

test('checkAndSettleInvoice applies on-chain balance to invoice', async () => {
  const invoice = {
    id: 'INV-test-001',
    owner: '12345',
    amount: 1,
    description: 'Test invoice',
    status: 'open',
    paid: 0,
    remaining: 1,
    paymentAddress: 'account-hash-abc123',
    payments: [],
  };

  saveInvoice(invoice);

  const updated = await checkAndSettleInvoice(invoice);
  expect(updated).not.toBeNull();
  expect(updated.status).toBe('paid');
  expect(updated.paid).toBeGreaterThanOrEqual(1);
  expect(updated.remaining).toBe(0);

  const stored = getInvoice(invoice.id);
  expect(stored).not.toBeNull();
  expect(stored.status).toBe('paid');
  expect(stored.paid).toBeGreaterThanOrEqual(1);
});
