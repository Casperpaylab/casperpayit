import fs from 'fs';
import path from 'path';
import { createWallet } from './core.js';
import crypto from 'crypto';

const STATE_FILE = process.env.CASPAY_STATE_FILE || path.resolve(process.cwd(), '.caspay-state.json');

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { wallets: {}, invoices: {}, sessions: {} };
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      wallets: parsed.wallets || {},
      invoices: parsed.invoices || {},
      sessions: parsed.sessions || {},
    };
  } catch (error) {
    return { wallets: {}, invoices: {}, sessions: {} };
  }
}

export { readState };

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function ensureOwnerState(state, owner) {
  const current = state.wallets[owner];
  if (!current) {
    state.wallets[owner] = {
      personal: null,
      business: null,
      active: 'personal',
    };
    return state.wallets[owner];
  }

  if (current && typeof current === 'object' && !('personal' in current && 'business' in current)) {
    state.wallets[owner] = {
      personal: current,
      business: null,
      active: 'personal',
    };
    return state.wallets[owner];
  }

  return current;
}

export function getWallets(owner) {
  const state = readState();
  const ownerState = state.wallets[owner];
  if (!ownerState) {
    return { personal: null, business: null, active: 'personal' };
  }
  return ownerState;
}

export function getOrCreateWallet(owner, type = 'personal') {
  const state = readState();
  const ownerState = ensureOwnerState(state, owner);

  if (ownerState[type]) {
    return ownerState[type];
  }

  const created = createWallet(`${owner}:${type}`);
  ownerState[type] = created;
  if (!ownerState.active) ownerState.active = type;
  writeState(state);
  return created;
}

export function saveWallet(owner, type, wallet) {
  const state = readState();
  const ownerState = ensureOwnerState(state, owner);
  ownerState[type] = wallet;
  if (!ownerState.active) ownerState.active = type;
  writeState(state);
  return wallet;
}

export function getActiveWallet(owner) {
  const state = readState();
  const ownerState = state.wallets[owner];
  if (!ownerState) return null;
  const type = ownerState.active || 'personal';
  return ownerState[type] || ownerState.personal || ownerState.business || null;
}

export function setActiveWalletType(owner, type) {
  const state = readState();
  const ownerState = ensureOwnerState(state, owner);
  ownerState.active = type;
  writeState(state);
  return ownerState[type] || null;
}

export function getSession(owner) {
  const state = readState();
  return state.sessions[owner] || null;
}

export function setSession(owner, session) {
  const state = readState();
  state.sessions[owner] = session;
  writeState(state);
  return session;
}

export function clearSession(owner) {
  const state = readState();
  if (state.sessions && owner in state.sessions) {
    delete state.sessions[owner];
    writeState(state);
  }
}

export function saveInvoice(invoice) {
  const state = readState();
  state.invoices[invoice.id] = invoice;
  writeState(state);
  return invoice;
}

export function getInvoice(invoiceId) {
  const state = readState();
  return state.invoices[invoiceId] || null;
}

export function getInvoicesForOwner(owner) {
  const state = readState();
  return Object.values(state.invoices).filter((invoice) => invoice.owner === owner);
}

export function updateInvoice(invoiceId, updater) {
  const state = readState();
  const current = state.invoices[invoiceId];
  if (!current) return null;
  const updated = updater(current);
  state.invoices[invoiceId] = updated;
  writeState(state);
  return updated;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

export function verifyPin(owner, pin) {
  const state = readState();
  const ownerState = state.wallets[owner];
  if (!ownerState) return false;
  const personal = ownerState.personal || null;
  const business = ownerState.business || null;
  const h = hashPin(pin);
  if (personal && personal.pinHash && personal.pinHash === h) return true;
  if (business && business.pinHash && business.pinHash === h) return true;
  return false;
}
