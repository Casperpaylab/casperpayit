// test/webhook.integration.test.js
//
// Integration tests for webhook invoice settlement and server API behavior.

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { jest } from '@jest/globals';

const STATE_FILE = path.resolve(process.cwd(), '.caspay-state.webhook.test.json');
process.env.CASPAY_STATE_FILE = STATE_FILE;

// Ensure no BOT_TOKEN so server won't attempt Telegram send
delete process.env.BOT_TOKEN;

const appModule = await import('../server/index.js');
const app = appModule.default;
const { saveInvoice, getInvoice } = await import('../lib/caspay/state.js');

beforeEach(() => {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
});
afterAll(() => {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
});

test('webhook /webhook/invoice-settle updates invoice and returns ok', async () => {
  const invoice = {
    id: 'INV-webhook-1',
    owner: '999',
    amount: 2,
    description: 'Webhook test',
    status: 'open',
    paid: 0,
    remaining: 2,
    paymentAddress: 'account-hash-zzz',
    payments: [],
  };
  saveInvoice(invoice);

  const res = await request(app)
    .post('/webhook/invoice-settle')
    .send({ invoiceId: invoice.id, amount: 2, source: 'test' })
    .set('Accept', 'application/json');

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('ok', true);
  expect(res.body.invoice).toBeDefined();
  const stored = getInvoice(invoice.id);
  expect(stored.status).toBe('paid');
  expect(stored.remaining).toBe(0);
});
