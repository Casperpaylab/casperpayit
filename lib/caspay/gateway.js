// lib/caspay/gateway.js
//
// Casper gateway helper functions for deposit info, source balances, and transfer status.

import axios from 'axios';

const GATEWAY_API_URL = process.env.GATEWAY_API_URL || null;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || null;
export const GATEWAY_WALLET_ADDRESS = process.env.GATEWAY_WALLET_ADDRESS || 'gateway-placeholder-address';

export const SUPPORTED_CHAINS = [
  { name: 'Sepolia', symbol: 'ETH', explorer: 'https://sepolia.etherscan.io/tx/' },
  { name: 'Base Sepolia', symbol: 'BASE', explorer: '' },
  { name: 'Fuji', symbol: 'AVAX', explorer: '' },
];

function apiClient() {
  if (!GATEWAY_API_URL) return null;
  const headers = {};
  if (GATEWAY_API_KEY) headers['x-api-key'] = GATEWAY_API_KEY;
  return axios.create({ baseURL: GATEWAY_API_URL, headers, timeout: 20000 });
}

export async function getDepositInfo(address) {
  const client = apiClient();
  if (!client) {
    return { chains: SUPPORTED_CHAINS, gatewayAddress: GATEWAY_WALLET_ADDRESS };
  }
  try {
    const res = await client.get('/deposit-info', { params: { address } });
    return res.data;
  } catch (err) {
    throw new Error(err?.response?.data?.message || err.message || 'Gateway getDepositInfo failed');
  }
}

export async function getSourceChainBalances(address) {
  const client = apiClient();
  if (!client) {
    // Return mock balances (0)
    return SUPPORTED_CHAINS.map(c => ({ chain: c.name, usdc: '0', gas: '0', symbol: c.symbol }));
  }
  try {
    const res = await client.get('/source-balances', { params: { address } });
    return res.data;
  } catch (err) {
    throw new Error(err?.response?.data?.message || err.message || 'Gateway getSourceChainBalances failed');
  }
}

export async function getTransferStatus(address) {
  const client = apiClient();
  if (!client) return {};
  try {
    const res = await client.get('/transfer-status', { params: { address } });
    return res.data;
  } catch (err) {
    throw new Error(err?.response?.data?.message || err.message || 'Gateway getTransferStatus failed');
  }
}

export async function executeDeposit(privateKeyPem, chainName, amount) {
  const client = apiClient();
  if (!client) {
    throw new Error('Gateway not configured. Set GATEWAY_API_URL to enable in-bot deposits.');
  }
  try {
    const res = await client.post('/deposit', { privateKeyPem, chainName, amount });
    return res.data;
  } catch (err) {
    throw new Error(err?.response?.data?.message || err.message || 'Gateway executeDeposit failed');
  }
}

export async function transferToArc(privateKeyPem, chainName, amount, arcAddress) {
  const client = apiClient();
  if (!client) {
    throw new Error('Gateway not configured. Set GATEWAY_API_URL to enable transfers to Arc.');
  }
  try {
    const res = await client.post('/transfer-to-arc', { privateKeyPem, chainName, amount, arcAddress });
    return res.data;
  } catch (err) {
    throw new Error(err?.response?.data?.message || err.message || 'Gateway transferToArc failed');
  }
}

export default {
  SUPPORTED_CHAINS,
  GATEWAY_WALLET_ADDRESS,
  getDepositInfo,
  getSourceChainBalances,
  getTransferStatus,
  executeDeposit,
  transferToArc,
};
