// test/caspay.test.js
//
// Unit tests for CasPay wallet creation, invoice generation, and reconciliation.

import { createWallet, createInvoice, applyPaymentToInvoice } from '../lib/caspay/core.js';

describe('CasPay wallet and invoice flows', () => {
  test('creates a wallet with a deterministic address and zero balance', () => {
    const wallet = createWallet('telegram:123');

    expect(wallet.address).toMatch(/^account-hash-/);
    expect(wallet.balance).toBe(0);
    expect(wallet.owner).toBe('telegram:123');
  });

  test('creates an invoice with a unique virtual account address', () => {
    const wallet = createWallet('merchant');
    const invoice = createInvoice(wallet, { amount: 25, description: 'Design work' });

    expect(invoice.status).toBe('open');
    expect(invoice.amount).toBe(25);
    expect(invoice.virtualAccount).toMatch(/^account-hash-/);
    expect(invoice.description).toBe('Design work');
  });

  test('reconciles partial and full invoice payments', () => {
    const wallet = createWallet('merchant');
    const invoice = createInvoice(wallet, { amount: 100, description: 'Consulting' });

    const partial = applyPaymentToInvoice(invoice, 40);
    expect(partial.status).toBe('partial');
    expect(partial.remaining).toBe(60);

    const full = applyPaymentToInvoice(partial, 60);
    expect(full.status).toBe('paid');
    expect(full.remaining).toBe(0);
    expect(full.paid).toBe(100);
  });
});
