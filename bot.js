import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import { Telegraf, Markup } from 'telegraf';
import { createInvoice, createHDInvoice, applyPaymentToInvoice, formatInvoice, createWallet } from './lib/caspay/core.js';
import invoiceListener from './lib/caspay/invoice_listener.js';
import {
  getWallets,
  getOrCreateWallet,
  getActiveWallet,
  setActiveWalletType,
  getInvoicesForOwner,
  saveInvoice,
  saveWallet,
  getInvoice,
  getSession,
  setSession,
  clearSession,
} from './lib/caspay/state.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('[bot] BOT_TOKEN is not set. Add a valid Telegram bot token to your environment and restart.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

bot.use(async (ctx, next) => {
  console.log('[bot] incoming update', ctx.updateType, ctx.message?.text || ctx.callbackQuery?.data || 'no text');
  return next();
});

function userKey(ctx) {
  return String(ctx.from?.id || ctx.chat?.id || 'anonymous');
}

function formatWalletSummary(wallet, label = 'Personal') {
  return [
    `🏦 ${label} Wallet`,
    `Address: ${wallet.address}`,
    `Balance: ${wallet.balance} CSPR`,
    `Created: ${wallet.createdAt}`,
  ].join('\n');
}

function formatInvoiceShort(invoice) {
  return `• ${invoice.id} · ${invoice.status} · ${invoice.amount} CSPR · ${invoice.remaining} remaining`;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function createAndSaveWallet(owner, type, pin = null, metadata = {}) {
  const wallet = createWallet(`${owner}:${type}`);
  if (pin) wallet.pinHash = hashPin(pin);
  wallet.accountType = type;
  wallet.metadata = metadata;
  saveWallet(owner, type, wallet);
  return wallet;
}

function personalMainMenu(hasBusiness) {
  const rows = [
    ['💰 My Money', '📤 Send Payment', '🧾 New Invoice'],
    ['📋 My Invoices', '📥 Add Money', '⚙️ Settings'],
  ];
  if (hasBusiness) {
    rows.unshift(['💼 Switch to Business']);
  }
  return Markup.keyboard(rows).resize();
}

function businessMainMenu() {
  return Markup.keyboard([
    ['💼 Business Balance', '🧾 New Invoice', '📋 My Invoices'],
    ['📤 Send Payment', '📥 Add Money', '⚙️ Settings'],
  ]).resize();
}

function answerButtons() {
  return Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'main_menu')]]);
}

async function safeAnswerCbQuery(ctx) {
  try {
    await ctx.answerCbQuery();
  } catch (error) {
    console.warn('[bot] answerCbQuery failed', error?.message || error);
  }
}

function getOrCreatePersonalWallet(owner) {
  return getOrCreateWallet(owner, 'personal');
}

function ensureBusinessWallet(owner) {
  const wallets = getWallets(owner);
  if (wallets.business) return wallets.business;
  return getOrCreateWallet(owner, 'business');
}

function getActiveOrPersonalWallet(owner) {
  const active = getActiveWallet(owner);
  if (active) return active;
  return getOrCreatePersonalWallet(owner);
}

function getActiveWalletLabel(owner) {
  const wallets = getWallets(owner);
  const activeType = wallets.active || 'personal';
  return activeType === 'business' ? 'Business' : 'Personal';
}

async function showHome(ctx) {
  const owner = userKey(ctx);
  const wallets = getWallets(owner);
  const activeWallet = getActiveOrPersonalWallet(owner);
  const activeLabel = getActiveWalletLabel(owner);
  const hasBusiness = Boolean(wallets.business);

  const text = [
    `👋 Welcome back to CasPay.`,
    '',
    `Active account: ${activeLabel}`,
    '',
    formatWalletSummary(activeWallet, activeLabel),
    '',
    'Tap a button below to continue, or type a command like /invoice or /pay.',
  ].join('\n');

  await ctx.reply(text, hasBusiness ? businessMainMenu() : personalMainMenu(hasBusiness));
}

async function showBalance(ctx) {
  const owner = userKey(ctx);
  const activeWallet = getActiveOrPersonalWallet(owner);
  const activeLabel = getActiveWalletLabel(owner);
  await ctx.reply(formatWalletSummary(activeWallet, activeLabel), answerButtons());
}

async function showAddMoney(ctx) {
  const owner = userKey(ctx);
  const activeWallet = getActiveOrPersonalWallet(owner);
  const activeLabel = getActiveWalletLabel(owner);
  await ctx.reply(
    `📥 Add Money — ${activeLabel} Wallet\n\n` +
    `Use this Casper account hash to receive CSPR payments:\n` +
    `${activeWallet.address}\n\n` +
    `This is your self-custodial deposit address. Funds sent here belong only to you.`,
    answerButtons()
  );
}

async function listInvoices(ctx) {
  const owner = userKey(ctx);
  const invoices = getInvoicesForOwner(owner);
  if (invoices.length === 0) {
    return ctx.reply('🧾 You have no invoices yet. Create one with /invoice <amount> <description>.', answerButtons());
  }

  const lines = invoices.map(formatInvoiceShort);
  await ctx.reply(['🧾 Your Invoices', ''].concat(lines).join('\n'), answerButtons());
}

async function beginBusinessOnboarding(ctx) {
  const owner = userKey(ctx);
  setSession(owner, { type: 'onboarding', accountType: 'business', step: 'businessName', draft: {} });
  await ctx.reply(
    '💼 Business account selected.\n\n' +
    'Please send your business name.',
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'main_menu')]])
  );
}

async function beginPersonalOnboarding(ctx) {
  const owner = userKey(ctx);
  setSession(owner, { type: 'onboarding', accountType: 'personal', step: 'pin', draft: {} });
  await ctx.reply(
    '👤 Personal account selected.\n\n' +
    'Please enter a 4-digit PIN to secure your wallet.\n' +
    'This PIN will bind your private keys and be required for each transaction.',
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'main_menu')]])
  );
}

bot.start(async (ctx) => {
  const owner = userKey(ctx);
  const wallets = getWallets(owner);
  const hasBusiness = Boolean(wallets.business);

  if (!wallets.personal && !wallets.business) {
    const message = [
      '👋 Welcome to CasPay — your Telegram-native non-custodial Casper wallet assistant.',
      '',
      'CasPay lets you create two account types:',
      '• Personal account — for individual Casper payments, invoices, and wallet management.',
      '• Business account — for merchants with business details, branding, and a separate business wallet.',
      '',
      'Choose the account you want to create first, then set a 4-digit PIN to bind your private key.',
    ].join('\n');

    return ctx.reply(
      message,
      Markup.keyboard([
        ['👤 Personal Account', '💼 Business Account'],
      ]).resize()
    );
  }

  const activeWallet = getActiveOrPersonalWallet(owner);
  const activeLabel = getActiveWalletLabel(owner);

  const message = [
    '👋 Welcome back to CasPay.',
    '',
    `Active account: ${activeLabel}`,
    '',
    formatWalletSummary(activeWallet, activeLabel),
    '',
    'Tap a button below to continue, or type a command like /invoice or /pay.',
  ].join('\n');

  await ctx.reply(message, hasBusiness ? businessMainMenu() : personalMainMenu(hasBusiness));
});

bot.action('main_menu', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await showHome(ctx);
});

bot.action('switch_to_business', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const owner = userKey(ctx);
  const wallets = getWallets(owner);
  if (!wallets.business) {
    return beginBusinessOnboarding(ctx);
  }
  setActiveWalletType(owner, 'business');
  await ctx.reply('✅ Switched to your Business wallet.', answerButtons());
  await showHome(ctx);
});

bot.action('switch_to_personal', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const owner = userKey(ctx);
  setActiveWalletType(owner, 'personal');
  await ctx.reply('✅ Switched to your Personal wallet.', answerButtons());
  await showHome(ctx);
});

bot.command('newaccount', async (ctx) => {
  const owner = userKey(ctx);
  await ctx.reply(
    'Choose the account you want to create:',
    Markup.keyboard([['👤 Personal Account', '💼 Business Account']]).resize()
  );
});

bot.action('create_invoice', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const owner = userKey(ctx);
  setSession(owner, { type: 'await_invoice' });
  await ctx.reply(
    '🧾 Invoice creation\n\n' +
    'Send the invoice amount and description in one message.\n' +
    'Example: 150 Logo design for Acme Ltd',
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'main_menu')]])
  );
});

bot.action('list_invoices', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await listInvoices(ctx);
});

bot.action('balance', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await showBalance(ctx);
});

bot.action('add_money', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await showAddMoney(ctx);
});

bot.action('setup_business', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await beginBusinessOnboarding(ctx);
});

bot.command('balance', async (ctx) => showBalance(ctx));
bot.command('invoices', async (ctx) => listInvoices(ctx));

bot.command('invoice', async (ctx) => {
  const owner = userKey(ctx);
  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length >= 2) {
    const amount = Number(args[0]);
    const description = args.slice(1).join(' ');
    if (!Number.isFinite(amount) || amount <= 0) {
      return ctx.reply('Invoice amount must be a positive number.');
    }
    const wallet = getActiveOrPersonalWallet(owner);
    const invoice = createHDInvoice(wallet, { amount, description });
    saveInvoice(invoice);
    return ctx.reply(`✅ Invoice created.\n\n${formatInvoice(invoice)}`, answerButtons());
  }
  setSession(owner, { type: 'await_invoice' });
  return ctx.reply(
    '🧾 Invoice creation\n\nSend the invoice amount and description in one message.\n' +
    'Example: 150 Website design for TechCo',
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'main_menu')]])
  );
});

bot.command('pay', async (ctx) => {
  const owner = userKey(ctx);
  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length >= 2) {
    const invoiceId = args[0];
    const amount = Number(args[1]);
    const invoice = getInvoice(invoiceId);
    if (!invoice) {
      return ctx.reply('Invoice not found.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return ctx.reply('Payment amount must be a positive number.');
    }
    const updated = applyPaymentToInvoice(invoice, amount);
    saveInvoice(updated);
    return ctx.reply(`✅ Payment applied.\n\n${formatInvoice(updated)}`, answerButtons());
  }
  setSession(owner, { type: 'await_payment' });
  return ctx.reply(
    '💸 Apply payment to an invoice\n\nSend the invoice ID and amount in one message.\n' +
    'Example: INV-abc123 50',
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'main_menu')]])
  );
});

bot.command('addmoney', async (ctx) => showAddMoney(ctx));

bot.command('settings', async (ctx) => {
  const owner = userKey(ctx);
  const wallets = getWallets(owner);
  const activeLabel = getActiveWalletLabel(owner);
  return ctx.reply(
    `⚙️ Settings\n\n` +
    `Active wallet: ${activeLabel}\n` +
    `Personal address: ${wallets.personal?.address || 'not set'}\n` +
    `Business address: ${wallets.business?.address || 'not set'}\n\n` +
    `Private keys are stored locally in CasPay state.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('💼 Switch to Business', 'switch_to_business')],
      [Markup.button.callback('👤 Switch to Personal', 'switch_to_personal')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')],
    ])
  );
});

bot.hears('💰 My Money', (ctx) => showBalance(ctx));
bot.hears('📤 Send Payment', (ctx) => ctx.reply('Use /pay <invoiceId> <amount> or send payment details after tapping a button.'));
bot.hears('🧾 New Invoice', (ctx) => ctx.reply('Use /invoice <amount> <description> or type the amount and description now.'));
bot.hears('📋 My Invoices', (ctx) => listInvoices(ctx));
bot.hears('📥 Add Money', (ctx) => showAddMoney(ctx));
bot.hears('⚙️ Settings', (ctx) => ctx.reply('Use /settings to view wallet settings and switch accounts.'));
bot.hears('💼 Business Balance', async (ctx) => {
  const owner = userKey(ctx);
  const wallets = getWallets(owner);
  if (!wallets.business) {
    return ctx.reply('No Business wallet set up yet. Use /settings to create one.');
  }
  setActiveWalletType(owner, 'business');
  await showBalance(ctx);
});
bot.hears('👤 Personal Account', async (ctx) => beginPersonalOnboarding(ctx));

bot.hears('💼 Business Account', async (ctx) => beginBusinessOnboarding(ctx));

bot.hears('💼 Switch to Business', async (ctx) => {
  const owner = userKey(ctx);
  const wallets = getWallets(owner);
  if (!wallets.business) {
    return beginBusinessOnboarding(ctx);
  }
  setActiveWalletType(owner, 'business');
  await ctx.reply('✅ Switched to your Business wallet.', answerButtons());
  await showHome(ctx);
});

bot.on('text', async (ctx) => {
  const owner = userKey(ctx);
  const session = getSession(owner);
  const text = (ctx.message.text || '').trim();

  if (!session) {
    if (text.toLowerCase().startsWith('invoice ')) {
      const parts = text.slice(8).trim().split(/\s+/);
      const amount = Number(parts[0]);
      const description = parts.slice(1).join(' ');
      if (Number.isFinite(amount) && amount > 0 && description) {
        const wallet = getActiveOrPersonalWallet(owner);
        const invoice = createHDInvoice(wallet, { amount, description });
        saveInvoice(invoice);
        return ctx.reply(`✅ Invoice created.\n\n${formatInvoice(invoice)}`, answerButtons());
      }
    }
    if (text.toLowerCase().startsWith('pay ')) {
      const parts = text.slice(4).trim().split(/\s+/);
      const invoiceId = parts[0];
      const amount = Number(parts[1]);
      if (invoiceId && Number.isFinite(amount) && amount > 0) {
        const invoice = getInvoice(invoiceId);
        if (!invoice) return ctx.reply('Invoice not found.');
        const updated = applyPaymentToInvoice(invoice, amount);
        saveInvoice(updated);
        return ctx.reply(`✅ Payment applied.\n\n${formatInvoice(updated)}`, answerButtons());
      }
    }
    return ctx.reply('CasPay is ready. Use /invoice, /pay, /balance, /invoices, or the menu buttons.', answerButtons());
  }

  if (session.type === 'await_invoice') {
    const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s+(.+)$/);
    if (!match) {
      return ctx.reply('Please send the amount followed by the invoice description. Example: 150 Branding design');
    }
    const amount = Number(match[1]);
    const description = match[2].trim();
    const wallet = getActiveOrPersonalWallet(owner);
    const invoice = createHDInvoice(wallet, { amount, description });
    saveInvoice(invoice);
    clearSession(owner);
    return ctx.reply(`✅ Invoice created.\n\n${formatInvoice(invoice)}`, answerButtons());
  }

  if (session.type === 'await_payment') {
    const match = text.match(/^(\S+)\s+([0-9]+(?:\.[0-9]+)?)$/);
    if (!match) {
      return ctx.reply('Please send the invoice ID followed by the amount. Example: INV-123abc 50');
    }
    const invoiceId = match[1];
    const amount = Number(match[2]);
    const invoice = getInvoice(invoiceId);
    if (!invoice) {
      return ctx.reply('Invoice not found. Please check the ID and try again.');
    }
    const updated = applyPaymentToInvoice(invoice, amount);
    saveInvoice(updated);
    clearSession(owner);
    return ctx.reply(`✅ Payment applied.\n\n${formatInvoice(updated)}`, answerButtons());
  }

  if (session.type === 'onboarding') {
    // Personal onboarding: expect a 4-digit PIN
    if (session.accountType === 'personal' && session.step === 'pin') {
      const pin = (text || '').trim();
      if (!/^[0-9]{4}$/.test(pin)) {
        return ctx.reply('Please enter a 4-digit PIN (numbers only).');
      }
      const wallet = createAndSaveWallet(owner, 'personal', pin, {});
      setActiveWalletType(owner, 'personal');
      clearSession(owner);
      await ctx.reply(
        `✅ Personal wallet created and secured with a PIN.\n\n` +
        formatWalletSummary(wallet, 'Personal'),
        answerButtons()
      );
      return showHome(ctx);
    }

    // Business onboarding: expect a business name
    if (session.accountType === 'business' && session.step === 'businessName') {
      const businessName = text.trim();
      if (!businessName) return ctx.reply('Please tell me your business name.');
      const wallet = createAndSaveWallet(owner, 'business', null, { name: businessName });
      setActiveWalletType(owner, 'business');
      clearSession(owner);
      await ctx.reply(
        `✅ Business wallet created for ${businessName}.\n\n` +
        formatWalletSummary(wallet, 'Business'),
        answerButtons()
      );
      return showHome(ctx);
    }
  }

  return ctx.reply('I did not understand that yet. Use the buttons or /help to continue.', answerButtons());
});

async function startBot() {
  try {
    const me = await bot.telegram.getMe();
    console.log(`[bot] CasPay Telegram bot started as @${me.username || me.first_name || 'caspay'}`);
  } catch (err) {
    const message = err?.response?.description || err?.message || String(err);
    console.error('[bot] Failed to launch Telegram bot. The supplied BOT_TOKEN was rejected by Telegram.');
    console.error(`[bot] Telegram response: ${message}`);
    process.exit(1);
  }
}

bot.launch({ dropPendingUpdates: true })
  .then(() => startBot())
  .catch((err) => {
    const message = err?.response?.description || err?.message || String(err);
    console.error('[bot] Failed to launch Telegram bot', message);
    process.exit(1);
  });

// Start invoice listener to settle Casper invoice addresses (polling)
try {
  invoiceListener.startInvoiceListener(bot, Number(process.env.INVOICE_POLL_MS || 30000));
} catch (err) {
  console.error('[bot] Failed to start invoice listener', err?.message || err);
}

bot.catch((err) => console.error('[bot] Telegraf error', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
process.once('unhandledRejection', (reason) => console.error('[bot] unhandledRejection', reason));
