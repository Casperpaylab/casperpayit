// Simple single-file bot runner (polling) that calls the agent flow.
// This keeps things easy: run `node bot.js` to start the Telegram bot.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import casperJsSdk from 'casper-js-sdk';
const { PrivateKey, KeyAlgorithm } = casperJsSdk;
import { toClientCasperSigner } from '@make-software/casper-x402';
import { ExactCasperScheme } from '@make-software/casper-x402/exact/client';
import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } from '@x402/core/http';
import fs from 'fs';
import { Telegraf } from 'telegraf';

// Inline agent logic so `bot.js` is self-contained.
const SERVER_URL = (process.env.SERVER_URL || process.env.SERVER_URL_EXTERNAL || '').trim();
if (!SERVER_URL) {
	console.error('[bot] SERVER_URL is required. Set SERVER_URL to the deployed resource server URL (e.g. https://your-app.railway.app)');
	process.exit(1);
}

function buildServerUrl(path) {
	const base = SERVER_URL.replace(/\/+$/, '');
	const suffix = path.startsWith('/') ? path : `/${path}`;
	return `${base}${suffix}`;
}

let AGENT_PRIVATE_KEY_PEM = process.env.AGENT_PRIVATE_KEY;
if (!AGENT_PRIVATE_KEY_PEM && process.env.AGENT_PRIVATE_KEY_BASE64) {
	try { AGENT_PRIVATE_KEY_PEM = Buffer.from(process.env.AGENT_PRIVATE_KEY_BASE64, 'base64').toString('utf8'); } catch (e) {}
}
if (!AGENT_PRIVATE_KEY_PEM && process.env.AGENT_PRIVATE_KEY_PATH) {
	try { AGENT_PRIVATE_KEY_PEM = fs.readFileSync(process.env.AGENT_PRIVATE_KEY_PATH, 'utf8'); } catch (e) {}
}
if (AGENT_PRIVATE_KEY_PEM && AGENT_PRIVATE_KEY_PEM.includes('\\n')) {
	AGENT_PRIVATE_KEY_PEM = AGENT_PRIVATE_KEY_PEM.replace(/\\n/g, '\n');
}
const AGENT_KEY_ALGORITHM = (process.env.AGENT_KEY_ALGORITHM || 'ED25519').toUpperCase() === 'SECP256K1' ? KeyAlgorithm.SECP256K1 : KeyAlgorithm.ED25519;

async function buildClient() {
	if (!AGENT_PRIVATE_KEY_PEM) throw new Error('Agent private key not found. Provide AGENT_PRIVATE_KEY or AGENT_PRIVATE_KEY_PATH or AGENT_PRIVATE_KEY_BASE64');
	if (AGENT_PRIVATE_KEY_PEM.includes('BEGIN') && (!AGENT_PRIVATE_KEY_PEM.includes('END') || !AGENT_PRIVATE_KEY_PEM.includes('\n') || AGENT_PRIVATE_KEY_PEM.length < 100)) {
		throw new Error('AGENT_PRIVATE_KEY looks truncated; use AGENT_PRIVATE_KEY_PATH or AGENT_PRIVATE_KEY_BASE64');
	}
	const privateKey = PrivateKey.fromPem(AGENT_PRIVATE_KEY_PEM, AGENT_KEY_ALGORITHM);
	const signer = toClientCasperSigner(privateKey);
	const casperScheme = new ExactCasperScheme(signer);
	const client = new x402Client();
	client.register('casper:casper-test', casperScheme);
	client.register('casper:casper', casperScheme);
	return client;
}

async function fetchPaidResource(path) {
	const url = buildServerUrl(path);
	const client = await buildClient();
	console.log(`[agent] Requesting ${url} (no payment yet)...`);
	const firstAttempt = await axios.get(url, { validateStatus: () => true });
	if (firstAttempt.status !== 402) return firstAttempt.data;
	const paymentRequiredHeader = firstAttempt.headers['payment-required'];
	if (!paymentRequiredHeader) throw new Error('Server returned 402 but no PAYMENT-REQUIRED header was present.');
	const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
	const requirements = paymentRequired.accepts.find((r) => r.network.startsWith('casper:'));
	if (!requirements) throw new Error('No Casper-network payment option offered by this server.');
	const payloadResult = await client.createPaymentPayload(paymentRequired.x402Version, requirements);
	const paymentPayload = { x402Version: payloadResult.x402Version, scheme: requirements.scheme, network: requirements.network, payload: payloadResult.payload };
	const paymentHeader = encodePaymentSignatureHeader(paymentPayload);
	const paidAttempt = await axios.get(url, { headers: { 'PAYMENT-SIGNATURE': paymentHeader }, validateStatus: () => true });
	if (paidAttempt.status === 200) {
		let settlement = null;
		const settlementHeader = paidAttempt.headers['payment-response'];
		if (settlementHeader) settlement = decodePaymentResponseHeader(settlementHeader);
		return { data: paidAttempt.data, settlement };
	}
	throw new Error('Payment failed');
}

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
	console.error('[bot] BOT_TOKEN not set in .env — set BOT_TOKEN and restart');
	process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => ctx.reply('PayIT Demo bot (simple): send /marketdata to request paid market data.'));

bot.command('marketdata', async (ctx) => {
	await ctx.reply('Requesting /market-data from server (may require payment)...');
	try {
		const result = await fetchPaidResource('/market-data');
		if (result && result.data) {
			await ctx.reply(JSON.stringify(result.data, null, 2));
			if (result.settlement) {
				await ctx.reply(`Payment settled: ${JSON.stringify(result.settlement)}`);
			}
		} else {
			await ctx.reply(JSON.stringify(result, null, 2));
		}
	} catch (err) {
		await ctx.reply('Error fetching market data: ' + (err.message || String(err)));
	}
});

bot.launch()
	.then(() => console.log('[bot] Simple polling Telegram bot started'))
	.catch((err) => {
		console.error('[bot] Failed to launch Telegram bot', err);
		process.exit(1);
	});

bot.catch((err) => console.error('[bot] Telegraf error', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
process.once('unhandledRejection', (reason) => console.error('[bot] unhandledRejection', reason));

console.log('Run `node bot.js` to start the simple bot (polling).');
